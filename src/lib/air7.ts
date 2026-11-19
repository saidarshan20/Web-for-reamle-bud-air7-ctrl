// Interoperability facts: QuickBuds models.json (064812), PROTOCOL.md §§5,14–16.
// Independently implemented; no QuickBuds implementation code is included.
export const AIR7_ID = '064812';
export const ANC_STRENGTHS = [
  { value: 0x20, label: 'Smart', description: 'Automatically reduce noise based on your surroundings.' },
  { value: 0x08, label: 'Max', description: 'Best for very noisy places, such as airplanes and trains.' },
  { value: 0x10, label: 'Moderate', description: 'Best for noisy places, such as streets and malls.' },
  { value: 0x04, label: 'Mild', description: 'Best for quieter places, such as homes and offices.' },
] as const;
export const isStrength = (value: number) => ANC_STRENGTHS.some(s => s.value === value);
// statusQuery, plus windMode's 1A and bassBands' dynamic-sound switch 1D.
export const AIR7_FEATURES = [0x05, 0x04, 0x06, 0x09, 0x11, 0x18, 0x1b, 0x1a, 0x1d];
export const ACTIONS = [
  { value: 0, label: 'None', bit: 512 },
  { value: 1, label: 'Play / Pause', bit: 4 },
  { value: 3, label: 'Voice Assistant', bit: 1 },
  { value: 5, label: 'Previous Track', bit: 32 },
  { value: 6, label: 'Next Track', bit: 64 },
  { value: 0x0b, label: 'Volume Up', bit: 8 },
  { value: 0x0c, label: 'Volume Down', bit: 16 },
  { value: 8, label: 'Switch noise control modes', bit: 128 },
  { value: 0x11, label: 'Game mode', bit: 8192 },
];
export type Gesture = 2 | 3 | 4;
export interface GestureEntry { side: number; button: number; gesture: number; action: number }
export const actionsFor = (gesture: Gesture) => ACTIONS.filter(a => (a.bit & ({ 2: 581, 3: 8825, 4: 8833 }[gesture])) !== 0);

export function parseGestures(payload: number[]): GestureEntry[] {
  if (payload[0] !== 0 || payload.length < 2 || payload.length !== 2 + payload[1] * 4) throw new Error('Invalid gesture table');
  return Array.from({ length: payload[1] }, (_, i) => {
    const [side, button, gesture, action] = payload.slice(2 + i * 4, 6 + i * 4);
    return { side, button, gesture, action };
  });
}
export function gestureValue(entries: GestureEntry[], side: number, gesture: Gesture): number | null {
  const rows = entries.filter(e => e.side === side && e.button !== 6 && e.gesture === gesture);
  return rows.length && rows.every(e => e.action === rows[0].action) ? rows[0].action : null;
}
export function editGestures(entries: GestureEntry[], side: 1 | 2, changes: Partial<Record<Gesture, number>>): number[] {
  if (!entries.length) throw new Error('Read button settings first');
  const edited = entries.map(e => ({ ...e }));
  for (const [key, action] of Object.entries(changes)) {
    const gesture = Number(key) as Gesture;
    if (!actionsFor(gesture).some(a => a.value === action)) throw new Error('Unsupported gesture action');
    const rows = edited.filter(e => e.side === side && e.button !== 6 && e.gesture === gesture);
    if (!rows.length) throw new Error('Gesture not reported by these earbuds');
    rows.forEach(e => { e.action = action; });
  }
  return [edited.length, ...edited.flatMap(e => [e.side, e.button, e.gesture, e.action])];
}

export interface CustomPreset { selected: number; min: number; max: number; id: number; name: number[]; frequencies: number[]; gains: number[] }
export const AIR7_EQ_FREQUENCIES = [62, 250, 1000, 4000, 8000, 16000];
export const CUSTOM_EQ_LIMIT = 3; // QuickBuds catalog default; firmware can refuse a lower limit.
export const compatibleEQ = (p: CustomPreset) => p.gains.length === 6 && p.frequencies.length === 6 && p.min === -6 && p.max === 6;
export const presetName = (p: CustomPreset) => new TextDecoder().decode(new Uint8Array(p.name));
export function encodeEQName(name: string) {
  const normalized = name.trim().normalize('NFC');
  const bytes = Array.from(new TextEncoder().encode(normalized));
  if (!bytes.length) throw new Error('Enter a preset name');
  if (bytes.length > 32) throw new Error('That preset name is too long. Please shorten it');
  if (Array.from(normalized).some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127)) throw new Error('Preset names cannot contain line breaks or control characters');
  return bytes;
}
export const eqFingerprint = (p: CustomPreset) => JSON.stringify([p.min,p.max,p.name,p.frequencies,p.gains]);
export function sameEQPresets(expected: CustomPreset[], actual: CustomPreset[]) {
  // IDs may be renumbered after creation. Compare the complete content as a multiset.
  return JSON.stringify(expected.map(eqFingerprint).sort()) === JSON.stringify(actual.map(eqFingerprint).sort());
}
const signed = (b: number) => b > 127 ? b - 256 : b;
export function parseCustomEQ(p: number[]): CustomPreset[] {
  if (p[0] !== 0 || p.length < 2) throw new Error('Invalid custom EQ list');
  let offset = 2;
  const presets: CustomPreset[] = [];
  for (let i=0; i<p[1]; i++) {
    if(offset + 5 > p.length) throw new Error('Truncated custom EQ');
    const [selected, min, max, id, nameLength] = p.slice(offset, offset+5); offset += 5;
    if(offset + nameLength + 1 > p.length) throw new Error('Truncated custom EQ name');
    const name=p.slice(offset,offset+nameLength); offset+=nameLength;
    const bands=p[offset++];
    if(offset+bands*3>p.length) throw new Error('Truncated custom EQ bands');
    const frequencies: number[]=[], gains: number[]=[];
    for(let j=0;j<bands;j++) { frequencies.push(p[offset]|(p[offset+1]<<8)); gains.push(signed(p[offset+2])); offset+=3; }
    presets.push({selected,min:signed(min),max:signed(max),id,name,frequencies,gains});
  }
  if(offset!==p.length) throw new Error('Unexpected custom EQ data');
  return presets;
}
export function saveCustomEQ(preset: CustomPreset, gains: number[], name?: string) {
  if(gains.length!==6 || preset.frequencies.length!==6 || gains.some(g=>!Number.isInteger(g)||g<preset.min||g>preset.max)) throw new Error('Unsupported custom EQ bands or gains');
  const encodedName = name === undefined ? preset.name : encodeEQName(name);
  return [2,preset.min&255,preset.max&255,preset.id,encodedName.length,...encodedName,6,...preset.frequencies.flatMap((f,i)=>[f&255,f>>8,gains[i]&255])];
}
export function createCustomEQ(name: string, gains: number[], frequencies = AIR7_EQ_FREQUENCIES) {
  if(frequencies.length!==6 || frequencies.some(f=>!Number.isInteger(f)||f<1||f>65535)) throw new Error('Unsupported EQ frequencies');
  const payload = saveCustomEQ({ selected:0,min:-6,max:6,id:0,name:[],frequencies,gains },gains,name);
  payload[0]=1; // Create uses id 00; the device assigns the real id.
  return payload;
}

const commandBits: Record<number, number> = { 0x0108: 3, 0x0401: 3, 0x0403: 7, 0x010c: 8, 0x0404: 8, 0x0406: 10, 0x010f: 10, 0x0407: 11, 0x0205: 22, 0x0122: 34, 0x0418: 34, 0x0124: 38, 0x041b: 38 };
export function supports(bitmap: number[], command: number) {
  if ([0x0100, 0x0103, 0x0106, 0x010d, 0x0200, 0x0201].includes(command)) return true;
  const bit = commandBits[command];
  return bit !== undefined && !!(bitmap[Math.floor(bit / 8)] & (1 << (bit % 8)));
}
export interface Packet { command: number; seq: number; payload: number[] }
export function encodePacket(command: number, seq: number, payload: number[]) {
  let length = payload.length + 7;
  const prefix = [0xaa];
  do { const byte = length & 127; length >>>= 7; prefix.push(byte | (length ? 128 : 0)); } while (length);
  return new Uint8Array([...prefix, 0, 0, command & 255, command >> 8, seq, payload.length & 255, payload.length >> 8, ...payload]);
}
// Accept split/coalesced reads, LEB128 lengths and protocol slices. Reject malformed frames.
export class PacketReader {
  private buffer: number[] = [];
  private slices: number[] = [];
  private nextSlice = 0;
  feed(bytes: Uint8Array): Packet[] {
    this.buffer.push(...bytes);
    const packets: Packet[] = [];
    while (this.buffer.length >= 2) {
      if (this.buffer[0] !== 0xaa) { this.buffer.shift(); continue; }
      let length = 0, offset = 1, shift = 0;
      while (offset < this.buffer.length && offset <= 3) {
        const byte = this.buffer[offset++]; length |= (byte & 127) << shift; shift += 7;
        if (!(byte & 128)) break;
      }
      if (this.buffer[offset - 1] & 128) {
        if (offset > 3) { this.buffer.shift(); continue; }
        break;
      }
      if (length < 4 || length > 4096) { this.buffer.shift(); continue; }
      if (this.buffer.length < offset + length) break;
      const body = this.buffer.splice(0, offset + length).slice(offset);
      const slice = body[0];
      let message: number[];
      if (slice === 0) { message = body.slice(2); }
      else if ([1, 2, 3].includes(slice)) {
        if (slice === 1) { this.slices = []; this.nextSlice = 0; }
        if (body[2] !== this.nextSlice++) { this.slices = []; continue; }
        this.slices.push(...body.slice(3));
        if (this.slices.length > 4096) { this.slices = []; continue; }
        if (slice !== 3) continue;
        message = this.slices; this.slices = [];
      } else continue;
      if (message.length < 5 || message.length !== 5 + message[3] + (message[4] << 8)) continue;
      packets.push({ command: message[0] | (message[1] << 8), seq: message[2], payload: message.slice(5) });
    }
    return packets;
  }
}
