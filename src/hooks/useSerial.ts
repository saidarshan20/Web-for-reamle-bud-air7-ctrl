import { useState, useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { AIR7_ID, AIR7_FEATURES, isStrength, supports, encodePacket, PacketReader, parseGestures, gestureValue, editGestures, type Gesture, type GestureEntry, type Packet, parseCustomEQ, saveCustomEQ, createCustomEQ, compatibleEQ, presetName, encodeEQName, eqFingerprint, sameEQPresets, CUSTOM_EQ_LIMIT, type CustomPreset } from '@/lib/air7';

export interface LogEntry { time: string; message: string; type: 'rx' | 'tx' | 'err' | 'info' }
export interface TouchState {
  leftDouble: number | null; leftTriple: number | null; leftHold: number | null;
  rightDouble: number | null; rightTriple: number | null; rightHold: number | null;
}
export interface DeviceState {
  connected: boolean; loading: boolean; reconnecting: boolean; busy: boolean;
  deviceName: string; modelId: string | null; air7: boolean; bitmap: number[];
  ancMode: number; ancStrength: number | null; ancReady: boolean;
  eqPreset: number; eqReady: boolean; features: Record<number, number>;
  bassIntensity: number; bassReady: boolean; customEQ: number[]; customEQFrequencies: number[]; customEQReady: boolean;
  customPresets: CustomPreset[];
  touch: TouchState; volEnhancer: boolean; volReady: boolean;
  battery: { left: number; right: number; case: number };
  charging: { left: number; right: number; case: number };
}
const initialState: DeviceState = {
  connected: false, loading: false, reconnecting: false, busy: false,
  deviceName: 'realme Buds Air 7', modelId: null, air7: false, bitmap: [],
  ancMode: -1, ancStrength: null, ancReady: false, eqPreset: -1, eqReady: false,
  features: {}, bassIntensity: 0, bassReady: false, customEQ: [0,0,0,0,0,0], customEQFrequencies: [], customEQReady: false,
  customPresets: [],
  touch: { leftDouble: null, leftTriple: null, leftHold: null, rightDouble: null, rightTriple: null, rightHold: null },
  volEnhancer: false, volReady: false,
  battery: { left: -1, right: -1, case: -1 }, charging: { left: -1, right: -1, case: -1 },
};
interface SerialPort {
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
}
interface SerialAPI { requestPort(options: { allowedBluetoothServiceClassIds: string[] }): Promise<SerialPort> }
interface Pending { command: number; resolve: (p: number[]) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const errorText = (e: unknown) => e instanceof Error ? e.message : String(e);

export function useSerial() {
  const [state, setState] = useState(initialState);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const stateRef = useRef(initialState);
  const portRef = useRef<SerialPort | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const pending = useRef(new Map<number, Pending>());
  const gestures = useRef<GestureEntry[]>([]);
  const seq = useRef(0);
  const active = useRef(true);
  const writeQueue = useRef<Promise<unknown>>(Promise.resolve());
  const locked = useRef(false);
  const reconnectingRef = useRef(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout>>();
  const reconnect = useRef<() => Promise<void>>();
  const update = useCallback((patch: Partial<DeviceState>) => {
    stateRef.current = { ...stateRef.current, ...patch };
    if (active.current) setState(stateRef.current);
  }, []);
  const log = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    if (active.current) setLogs(prev => [...prev.slice(-200), { time: new Date().toLocaleTimeString(), message, type }]);
  }, []);
  const cancelPending = useCallback(() => {
    for (const p of pending.current.values()) { clearTimeout(p.timer); p.reject(new Error('Bluetooth connection closed')); }
    pending.current.clear();
  }, []);
  const request = useCallback((command: number, payload: number[] = []): Promise<number[]> => {
    const port = portRef.current;
    if (!port?.writable || !stateRef.current.connected) return Promise.reject(new Error('Connect first'));
    // FF is reserved for unsolicited pushes. Never reuse an outstanding sequence.
    do { seq.current = (seq.current + 1) % 255; } while (pending.current.has(seq.current));
    const id = seq.current;
    const packet = encodePacket(command, id, payload);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.current.delete(id); reject(new Error(`No reply to 0x${command.toString(16)}`)); }, 3000);
      pending.current.set(id, { command: command | 0x8000, resolve, reject, timer });
      const write = writeQueue.current.catch(() => {}).then(async () => {
        if (!pending.current.has(id)) return; // Never send a request after its timeout.
        if (port !== portRef.current || !port.writable) throw new Error('Bluetooth connection closed');
        const writer = port.writable.getWriter();
        try { await writer.write(packet); } finally { writer.releaseLock(); }
        log('TX: ' + Array.from(packet, b => b.toString(16).padStart(2, '0')).join(' '), 'tx');
      });
      writeQueue.current = write;
      void write.catch(e => { clearTimeout(timer); pending.current.delete(id); reject(e); });
    });
  }, [log]);
  const decode = useCallback(({ command, seq: id, payload: p }: Packet) => {
    log(`RX: cmd=${command.toString(16)} seq=${id.toString(16)} ` + p.map(b => b.toString(16).padStart(2, '0')).join(' '), 'rx');
    const match = pending.current.get(id);
    // Ignore stale/unmatched replies. Pushes never complete requests.
    if (match && match.command === command && id !== 255) {
      clearTimeout(match.timer); pending.current.delete(id);
      if (p[0] !== 0 && !(command === 0x8205 && p[0] === 1)) { match.reject(new Error(p[0] === 0x0e ? 'Put an earbud in your ear and try again' : `Device refused command (status ${p[0] ?? 'missing'})`)); return; }
      match.resolve(p);
    }
    if (!stateRef.current.air7) return;
    if (command === 0x0204 && p[0] === 3 && p[1] === 1 && p[2] === 1 && p.length >= 4) {
      const value = p[3] | ((p[4] ?? 0) << 8);
      update({ ancMode: value, ...(isStrength(value) ? { ancStrength: value } : {}) });
    }
    if (command === 0x0204 && p[0] === 5 && p.length === 2) update({ features: { ...stateRef.current.features, 6: p[1] } });
    if (command === 0x0204 && p[0] === 1 && p[1] > 0 && p.length === 2 + p[1] * 2) {
      const battery = { ...stateRef.current.battery }, charging = { ...stateRef.current.charging };
      for (let i=2;i<p.length;i+=2) {
        const key = ({1:'left',2:'right',3:'case'} as const)[p[i]];
        if (key) { const value = p[i+1] & 127; battery[key] = value > 0 && value <= 100 ? value : -1; charging[key] = p[i+1] >> 7; }
      }
      update({ battery, charging });
    }
  }, [log, update]);
  const readLoop = useCallback(async (port: SerialPort) => {
    const framer = new PacketReader();
    if (!port.readable) return;
    const reader = port.readable.getReader(); readerRef.current = reader;
    try {
      while (active.current && port === portRef.current) {
        const { value, done } = await reader.read();
        if (done) break;
        framer.feed(value).forEach(decode);
      }
    } catch (e) { log('RX error: ' + errorText(e), 'err'); }
    finally {
      reader.releaseLock(); if (readerRef.current === reader) readerRef.current = null;
      cancelPending();
      if (active.current && port === portRef.current) {
        update({ ...initialState, reconnecting: true });
        if (!reconnectingRef.current) retryTimer.current = setTimeout(() => { void reconnect.current?.(); }, 3000);
      }
    }
  }, [cancelPending, decode, log, update]);
  const readANC = useCallback(async () => {
    const p = await request(0x010c, [1,1]);
    if (p.length < 4 || p[1] !== 1 || p[2] !== 1 || p.length > 7) throw new Error('Invalid noise control reply');
    const value = p.slice(3).reduce((n, b, i) => n + b * 2 ** (8 * i), 0);
    update({ ancMode: value, ancReady: true, ...(isStrength(value) ? { ancStrength: value } : {}) });
    return value;
  }, [request, update]);
  const readTouch = useCallback(async () => {
    const table = parseGestures(await request(0x0108)); gestures.current = table;
    update({ touch: { leftDouble: gestureValue(table,1,2), leftTriple: gestureValue(table,1,3), leftHold: gestureValue(table,1,4), rightDouble: gestureValue(table,2,2), rightTriple: gestureValue(table,2,3), rightHold: gestureValue(table,2,4) } });
    return table;
  }, [request, update]);
  const readFeatures = useCallback(async () => {
    const p = await request(0x010d, [AIR7_FEATURES.length, ...AIR7_FEATURES]);
    if (p.length !== 2 + p[1] * 2) throw new Error('Invalid feature reply');
    const features: Record<number, number> = {};
    for (let i=2; i<p.length; i+=2) if (AIR7_FEATURES.includes(p[i])) features[p[i]] = p[i+1];
    update({ features }); return features;
  }, [request, update]);
  const readEQ = useCallback(async () => {
    const p = await request(0x010f); if (p.length < 2) throw new Error('Invalid EQ reply');
    update({ eqPreset: p[1], eqReady: true }); return p[1];
  }, [request, update]);
  const readCustomEQ = useCallback(async () => {
    const presets=parseCustomEQ(await request(0x0122));
    const preset=presets.find(p=>p.selected===1 && p.gains.length===6 && p.min===-6 && p.max===6) ?? presets.find(p=>p.gains.length===6 && p.min===-6 && p.max===6);
    update({customPresets:presets, customEQReady:supports(stateRef.current.bitmap,0x0418), ...(preset ? {customEQ:preset.gains,customEQFrequencies:preset.frequencies} : {})});
    return presets;
  },[request,update]);
  const initialize = useCallback(async () => {
    update({ loading: true });
    try {
      const bitmap = (await request(0x0100)).slice(1); update({ bitmap });
      const product = await request(0x0103);
      const modelId = product.slice(1,4).reverse().map(b => b.toString(16).padStart(2,'0')).join('');
      update({ modelId, air7: modelId === AIR7_ID, deviceName: modelId === AIR7_ID ? initialState.deviceName : `Device ${modelId || '(unknown)'}` });
      if (modelId !== AIR7_ID) { log('Standard Air 7 not identified; model-specific writes disabled.', 'err'); return; }
      const optional = async (job: () => Promise<unknown>) => { try { await job(); } catch(e) { log(errorText(e), 'err'); } };
      await optional(async () => {
        const codes = await request(0x0200);
        if (codes.length !== 2 + codes[1]) throw new Error('Invalid event list');
        const selected = codes.slice(2).filter(c => [1,2,3,5].includes(c));
        if (selected.length && supports(bitmap,0x0205)) await request(0x0205,[selected.length,...selected]);
        else for (const c of selected) await request(0x0201,[c]);
      });
      await optional(async () => {
        const p = await request(0x0106);
        if (p.length !== 2 + p[1] * 2) throw new Error('Invalid battery reply');
        const battery = { ...initialState.battery }, charging = { ...initialState.charging };
        for(let i=2;i<p.length;i+=2) { const key = ({1:'left',2:'right',3:'case'} as const)[p[i]]; if(key) { const value=p[i+1]&127; battery[key]=value>0 && value<=100?value:-1; charging[key]=p[i+1]>>7; } }
        update({battery,charging});
      });
      if(supports(bitmap,0x010c)) await optional(readANC);
      await optional(readFeatures);
      if(supports(bitmap,0x010f)) await optional(readEQ);
      if(supports(bitmap,0x0108)) await optional(readTouch);
      if(supports(bitmap,0x0122)) await optional(readCustomEQ);
      // Air 7 has three dynamic sound bands; the original single-band slider is disabled.
      log('State synchronization finished; unavailable controls remain disabled.');
    } finally { update({ loading: false }); }
  }, [log, readANC, readEQ, readFeatures, readTouch, readCustomEQ, request, update]);
  const open = useCallback(async (port: SerialPort) => {
    await port.open({ baudRate:115200 }); portRef.current = port; gestures.current = [];
    update({ ...initialState, connected:true, loading:true });
    void readLoop(port);
    await initialize();
    if (!stateRef.current.connected) throw new Error('Connection lost during initialization');
  }, [initialize, readLoop, update]);
  reconnect.current = async () => {
    const port = portRef.current; if (!port || !active.current) return;
    if (reconnectingRef.current) return;
    reconnectingRef.current = true;
    try {
      try { await port.close(); } catch { /* OS may have already closed the device */ }
      for(let i=0;i<15 && active.current;i++) {
        try { await open(port); return; } catch(e) {
          log('Reconnect: '+errorText(e),'err');
          portRef.current = null; cancelPending();
          try { await readerRef.current?.cancel(); } catch { /* disconnected */ }
          try { await port.close(); } catch { /* disconnected */ }
          if (!active.current) return;
          portRef.current = port;
          update({ ...initialState, reconnecting: true });
        }
        await sleep(2000);
      }
      update({ reconnecting:false, connected:false, loading:false });
    } finally { reconnectingRef.current = false; }
  };
  const connect = useCallback(async () => {
    try {
      const serial = (navigator as Navigator & { serial?: SerialAPI }).serial;
      if (!serial) throw new Error('Web Serial is unavailable. Use desktop Brave, Chrome or Edge on HTTPS or localhost.');
      const port = await serial.requestPort({ allowedBluetoothServiceClassIds: [
        '0000079a-d102-11e1-9b23-00025b00a5a5',
        '00001107-d102-11e1-9b23-00025b00a5a5',
      ] });
      await open(port); return true;
    } catch(e) {
      const message=errorText(e); log(message,'err'); toast.error(message);
      const port=portRef.current; portRef.current=null; cancelPending();
      try { await readerRef.current?.cancel(); } catch { /* stream already closed */ }
      try { await port?.close(); } catch { /* port already closed */ }
      update({ ...initialState }); return false;
    }
  }, [cancelPending, log, open, update]);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false; clearTimeout(retryTimer.current); cancelPending();
      void readerRef.current?.cancel().catch(() => {});
      const port=portRef.current; portRef.current=null;
      if(port) void writeQueue.current.catch(()=>{}).then(async()=> { try { await port.close(); } catch { /* disconnected */ } });
    };
  }, [cancelPending]);
  const operation = useCallback(async (label: string, job: () => Promise<void>, successMessage?:string) => {
    if(locked.current) return false;
    locked.current=true; update({busy:true});
    try {
      const s=stateRef.current;
      if(!s.connected || s.loading || !s.air7) throw new Error('Connect and identify standard realme Buds Air 7 first');
      await job(); log(label+' confirmed by device'); toast.success(successMessage??label+' saved'); return true;
    } catch(e) { const message=errorText(e); log(label+': '+message,'err'); toast.error(message); return false; }
    finally { locked.current=false; update({busy:false}); }
  }, [log, update]);
  const setANC = useCallback((value: number) => operation('Noise control',async()=> {
    const s=stateRef.current;
    if(!s.ancReady || !supports(s.bitmap,0x0404) || ![1,2,4,8,16,32].includes(value)) throw new Error('Noise control unavailable');
    // Re-enter ANC at the last CONFIRMED strength. Never reset it when switching Off.
    const target=value===8 ? s.ancStrength ?? 8 : value;
    try { await request(0x0404,[1,1,target]); } catch(e) { await readANC().catch(()=>{}); throw e; }
    if(await readANC() !== target) throw new Error('Earbuds did not confirm the requested noise control setting');
  }), [operation, readANC, request]);
  const setANCStrength = useCallback((value: number) => operation('Noise cancellation strength',async()=> {
    const s=stateRef.current;
    if(!s.ancReady || !isStrength(s.ancMode) || !isStrength(value) || !supports(s.bitmap,0x0404)) throw new Error('Turn noise cancellation on first');
    try { await request(0x0404,[1,1,value]); } catch(e) { await readANC().catch(()=>{}); throw e; }
    if(await readANC() !== value) throw new Error('Earbuds did not confirm the requested strength');
  }), [operation, readANC, request]);
  const setEQ = useCallback((value: number) => operation('EQ mode', async()=> {
    if(!stateRef.current.eqReady || !supports(stateRef.current.bitmap,0x0406) || ![0,1,2,3].includes(value)) throw new Error('EQ mode unavailable');
    await request(0x0406,[value]); if(await readEQ()!==value) throw new Error('EQ mode was not confirmed');
  }), [operation, readEQ, request]);
  const setSys = useCallback((id: number,value: number) => operation('Setting',async()=> {
    if(!AIR7_FEATURES.includes(id) || id===5 || stateRef.current.features[id]===undefined || !supports(stateRef.current.bitmap,0x0403) || ![0,1].includes(value)) throw new Error('Feature unavailable on these earbuds');
    await request(0x0403,[id,value]);
    // Some firmware applies game mode after a short delay; read back rather than guess.
    for(let i=0;i<4;i++) { await sleep(400); const features=await readFeatures(); if(features[id]===value) return; }
    throw new Error('Earbuds did not confirm this setting');
  }), [operation, readFeatures, request]);
  const applyTouch = useCallback((side: 1 | 2, changes: Partial<Record<Gesture,number>>) => operation('Button settings',async()=> {
    if(!supports(stateRef.current.bitmap,0x0401)) throw new Error('Button settings unavailable');
    if(!Object.keys(changes).length) throw new Error('No button settings changed');
    // Fresh table protects settings changed in realme Link since connecting.
    const before=await readTouch(); const payload=editGestures(before,side,changes);
    await request(0x0401,payload); const after=await readTouch();
    const expected=parseGestures([0,...payload]);
    if(expected.length!==after.length || expected.some(e=>!after.some(a=>a.side===e.side && a.button===e.button && a.gesture===e.gesture && a.action===e.action))) throw new Error('Button settings were not fully confirmed; inspect the reloaded settings');
  }), [operation, readTouch, request]);
  const writeCustomEQ = useCallback(async(payload:number[]) => {
    try { return await request(0x0418,payload); }
    catch(e) {
      await readCustomEQ().catch(()=>{});
      await readEQ().catch(()=>{});
      throw e;
    }
  },[request,readCustomEQ,readEQ]);
  const confirmCustomEQ = useCallback(async (target:CustomPreset, expected:CustomPreset[]) => {
    const reported=await readCustomEQ();
    const selected=await readEQ();
    if(selected!==target.id || !reported.some(p=>p.id===target.id && eqFingerprint(p)===eqFingerprint(target)) || !sameEQPresets(expected,reported)) {
      throw new Error('Custom EQ was not fully confirmed; the device preset list has been reloaded');
    }
  },[readCustomEQ,readEQ]);
  const saveNamedCustomEQ = useCallback((id:number|null,name:string,bands:number[]) => operation('Custom EQ',async()=> {
    if(!stateRef.current.customEQReady || !supports(stateRef.current.bitmap,0x0418) || !supports(stateRef.current.bitmap,0x010f)) throw new Error('Custom EQ unavailable');
    const baseline=stateRef.current.customPresets.find(p=>p.id===id);
    const encodedName=encodeEQName(name);
    const normalizedName=new TextDecoder().decode(new Uint8Array(encodedName));
    const before=await readCustomEQ();
    if(before.some(p=>p.id!==id && presetName(p).trim().normalize('NFC').toLowerCase()===normalizedName.toLowerCase())) throw new Error('Choose a different name; that preset already exists');
    if(id===null) {
      if(before.length>=CUSTOM_EQ_LIMIT) throw new Error('The custom preset limit has been reached');
      const frequencies=before.find(compatibleEQ)?.frequencies;
      const payload=createCustomEQ(normalizedName,bands,frequencies);
      const reply=await writeCustomEQ(payload);
      const reported=await readCustomEQ();
      const expected=parseCustomEQ([0,1,0,...payload.slice(1)])[0];
      const created=reported.find(p=>p.id===reply[1] && eqFingerprint(p)===eqFingerprint(expected));
      if(reply.length<2 || !created || !sameEQPresets([...before,expected],reported)) throw new Error('Preset creation was not confirmed; inspect the reloaded device list before retrying');
      try {
        await writeCustomEQ(saveCustomEQ(created,created.gains));
        await confirmCustomEQ(created,reported);
      } catch(e) { throw new Error('Preset was created, but activation was not confirmed: '+errorText(e)); }
    } else {
      const preset=before.find(p=>p.id===id);
      if(!baseline || !preset || eqFingerprint(baseline)!==eqFingerprint(preset)) throw new Error('Preset changed on the earbuds; review the reloaded list before saving');
      if(!compatibleEQ(preset)) throw new Error('This preset does not use the supported six-band EQ layout');
      const payload=saveCustomEQ(preset,bands,normalizedName);
      const target={...preset,name:encodedName,gains:[...bands]};
      await writeCustomEQ(payload);
      await confirmCustomEQ(target,before.map(p=>p.id===id?target:p));
    }
  }),[operation,readCustomEQ,writeCustomEQ,confirmCustomEQ]);
  const selectCustomEQ = useCallback((id:number) => operation('Custom EQ',async()=> {
    if(!stateRef.current.customEQReady) throw new Error('Custom EQ unavailable');
    const baseline=stateRef.current.customPresets.find(p=>p.id===id);
    const before=await readCustomEQ(), preset=before.find(p=>p.id===id);
    if(!baseline || !preset || !compatibleEQ(preset) || eqFingerprint(baseline)!==eqFingerprint(preset)) throw new Error('Preset changed on the earbuds; review the reloaded list');
    await writeCustomEQ(saveCustomEQ(preset,preset.gains));
    await confirmCustomEQ(preset,before);
  }),[operation,readCustomEQ,writeCustomEQ,confirmCustomEQ]);
  const deleteCustomEQ = useCallback((target:CustomPreset) => operation('Delete custom EQ',async()=> {
    if(!stateRef.current.customEQReady || !supports(stateRef.current.bitmap,0x0418)) throw new Error('Custom EQ unavailable');
    const before=await readCustomEQ(), preset=before.find(p=>p.id===target.id);
    if(!preset || !compatibleEQ(preset) || eqFingerprint(preset)!==eqFingerprint(target)) throw new Error('Preset changed on the earbuds; cancel and choose it again before deleting');
    const payload=saveCustomEQ(preset,preset.gains);
    payload[0]=3; // Documented delete action, preserving the reported preset metadata.
    await writeCustomEQ(payload);
    const reported=await readCustomEQ();
    await readEQ(); // Firmware chooses the fallback; do not invent or force one.
    if(!sameEQPresets(before.filter(p=>p.id!==target.id),reported)) throw new Error('Deletion was not fully confirmed; the device preset list has been reloaded');
  },'Custom EQ deleted'),[operation,readCustomEQ,readEQ,writeCustomEQ]);
  const unavailable = useCallback(async () => { toast.error('Command layout is not verified for standard Buds Air 7'); return false; }, []);
  return { state, logs, connect, setANC, setANCStrength, setEQ, setSys, applyTouch,
    setVolEnhancer: unavailable, setDynamicBassIntensity: unavailable, saveNamedCustomEQ, selectCustomEQ, deleteCustomEQ };
}
