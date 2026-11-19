import { act, renderHook, waitFor, cleanup } from '@testing-library/react';
import { ReadableStream, WritableStream } from 'node:stream/web';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSerial } from '@/hooks/useSerial';
import { encodePacket, PacketReader, type Packet, type CustomPreset } from '@/lib/air7';
vi.mock('sonner',()=>({toast:{success:vi.fn(),error:vi.fn()}}));

function device(model=[0x12,0x48,0x06],eqSupported=true) {
  let controller: ReadableStreamDefaultController<Uint8Array>;
  let anc=32, rejectANC=false, ignoreANC=false, wrongSeq=false;
  const hold=8;
  let custom:CustomPreset[]=[];
  let activeEQ=0, ignoreCustom=false;
  let table=[1,1,2,1,1,1,3,6,1,1,4,hold,2,1,2,1,2,1,3,6,2,1,4,8,4,6,2,29];
  const writes:Packet[]=[], framer=new PacketReader();
  const respond=(packet:Packet,payload:number[])=>controller.enqueue(encodePacket(packet.command|0x8000, wrongSeq ? (packet.seq+1)%255 : packet.seq,payload));
  const port={
    readable:new ReadableStream<Uint8Array>({start(c){controller=c;}}),
    writable:new WritableStream<Uint8Array>({write(bytes){
      for(const packet of framer.feed(bytes)) {
        writes.push(packet);
        switch(packet.command) {
          case 0x0100: respond(packet,[0,0xff,0xff,0xff,0xff,eqSupported?4:0,0,0]); break;
          case 0x0103: respond(packet,[0,...model]); break;
          case 0x0200: respond(packet,[0,3,1,2,3]); break;
          case 0x0205: respond(packet,[1,3,1,0,2,0,3,0]); break;
          case 0x0106: respond(packet,[0,3,1,90,2,80,3,70]); break;
          case 0x010c: respond(packet,[0,1,1,anc]); break;
          case 0x010d: respond(packet,[0,2,6,0,0x18,0]); break;
          case 0x010f: respond(packet,[0,activeEQ]); break;
          case 0x0122: respond(packet,[0,custom.length,...custom.flatMap(p=>[p.selected,p.min&255,p.max&255,p.id,p.name.length,...p.name,p.gains.length,...p.frequencies.flatMap((f,i)=>[f&255,f>>8,p.gains[i]&255])])]); break;
          case 0x0418: {
            const p=packet.payload,n=p[4],bands=p[5+n];
            const item:CustomPreset={selected:0,min:p[1]-256,max:p[2],id:p[3],name:p.slice(5,5+n),gains:[],frequencies:[]};
            for(let i=0;i<bands;i++){const o=6+n+i*3;item.frequencies.push(p[o]|(p[o+1]<<8));item.gains.push(p[o+2]>127?p[o+2]-256:p[o+2]);}
            if(p[0]===1){item.id=7+custom.length;custom.push(item);}
            else if(p[0]===3 && !ignoreCustom){custom=custom.filter(x=>x.id!==item.id).map((x,i)=>({...x,id:7+i,selected:0}));activeEQ=3;}
            else if(p[0]!==3 && !ignoreCustom){custom=custom.map(x=>x.id===item.id?{...item,selected:1}:{...x,selected:0});activeEQ=item.id;}
            respond(packet,[0,item.id]);break;
          }
          case 0x0406: activeEQ=packet.payload[0]; respond(packet,[0]); break;
          case 0x0108: respond(packet,[0,table.length/4,...table]); break;
          case 0x0404: if(!rejectANC&&!ignoreANC) anc=packet.payload[2]; respond(packet,[rejectANC?14:0]); break;
          case 0x0401: table=packet.payload.slice(1); respond(packet,[0]); break;
          default: respond(packet,[1]);
        }
      }
    }}),
    open:vi.fn(async()=>{}),close:vi.fn(async()=>{}),
  };
  Object.defineProperty(navigator,'serial',{value:{requestPort:async()=>port},configurable:true});
  return { writes, ignoreCustom:()=>{ignoreCustom=true;}, externalRename:()=>{custom[0].name=[88];}, reject:()=>{rejectANC=true;}, ignore:()=>{ignoreANC=true;}, wrong:()=>{wrongSeq=true;}, push:(p:number[])=>controller.enqueue(encodePacket(0x0204,255,p)) };
}
afterEach(cleanup);
async function connect() {
  const hook=renderHook(()=>useSerial());
  await act(async()=>{expect(await hook.result.current.connect()).toBe(true);});
  return hook;
}
describe('Web Serial confirmed state',()=>{
  it('deletes a preset and preserves the others after firmware renumbers their IDs',async()=>{
    const mock=device(); const {result}=await connect();
    await act(async()=>{await result.current.saveNamedCustomEQ(null,'One',[0,0,0,0,0,0]);});
    await act(async()=>{await result.current.saveNamedCustomEQ(null,'Two',[1,1,1,1,1,1]);});
    const target=result.current.state.customPresets[0];
    await act(async()=>{expect(await result.current.deleteCustomEQ(target)).toBe(true);});
    expect(result.current.state.customPresets).toHaveLength(1);
    expect(result.current.state.customPresets[0]).toMatchObject({id:7,name:[84,119,111],gains:[1,1,1,1,1,1]});
    expect(result.current.state.eqPreset).toBe(3);
    expect(mock.writes.filter(p=>p.command===0x0418).at(-1)?.payload.slice(0,5)).toEqual([3,250,6,7,3]);
    const count=mock.writes.length;
    await act(async()=>{expect(await result.current.deleteCustomEQ(target)).toBe(false);});
    expect(mock.writes.slice(count).some(p=>p.command===0x0418)).toBe(false);
  });
  it('does not claim deletion if firmware acknowledges without removing the preset',async()=>{
    const mock=device(); const {result}=await connect();
    await act(async()=>{await result.current.saveNamedCustomEQ(null,'One',[0,0,0,0,0,0]);});
    mock.ignoreCustom();
    await act(async()=>{expect(await result.current.deleteCustomEQ(result.current.state.customPresets[0])).toBe(false);});
    expect(result.current.state.customPresets).toHaveLength(1);
  });
  it('creates a named preset from an empty list using the device-assigned id',async()=>{
    const mock=device(); const {result}=await connect();
    expect(result.current.state.customEQReady).toBe(true);
    await act(async()=>{expect(await result.current.saveNamedCustomEQ(null,'Evening',[2,1,0,-1,-2,3])).toBe(true);});
    expect(result.current.state.customPresets).toHaveLength(1);
    expect(result.current.state.eqPreset).toBe(7);
    expect(result.current.state.customPresets[0].gains).toEqual([2,1,0,-1,-2,3]);
    const commands=mock.writes.filter(p=>p.command===0x0418);
    expect(commands[0].payload.slice(0,12)).toEqual([1,250,6,0,7,69,118,101,110,105,110,103]);
    expect(commands[1].payload[0]).toBe(2);
    expect(commands[1].payload[3]).toBe(7);
  });
  it('renames, saves and switches named presets while preserving the others',async()=>{
    device(); const {result}=await connect();
    await act(async()=>{await result.current.saveNamedCustomEQ(null,'Evening',[0,0,0,0,0,0]);});
    await act(async()=>{await result.current.saveNamedCustomEQ(null,'Focus',[1,1,1,1,1,1]);});
    await act(async()=>{expect(await result.current.saveNamedCustomEQ(7,'Night',[2,0,0,0,0,-2])).toBe(true);});
    expect(result.current.state.customPresets[1].name).toEqual([70,111,99,117,115]);
    expect(result.current.state.customPresets[1].gains).toEqual([1,1,1,1,1,1]);
    await act(async()=>{expect(await result.current.selectCustomEQ(8)).toBe(true);});
    expect(result.current.state.eqPreset).toBe(8);
    expect(result.current.state.customPresets[0].name).toEqual([78,105,103,104,116]);
  });
  it('does not report success for ignored saves or overwrite an externally changed preset',async()=>{
    const mock=device(); const {result}=await connect();
    await act(async()=>{await result.current.saveNamedCustomEQ(null,'Evening',[0,0,0,0,0,0]);});
    mock.ignoreCustom();
    await act(async()=>{expect(await result.current.saveNamedCustomEQ(7,'Night',[1,1,1,1,1,1])).toBe(false);});
    expect(result.current.state.customPresets[0].name).toEqual([69,118,101,110,105,110,103]);
    mock.externalRename(); const count=mock.writes.filter(p=>p.command===0x0418).length;
    await act(async()=>{expect(await result.current.saveNamedCustomEQ(7,'Night',[1,1,1,1,1,1])).toBe(false);});
    expect(mock.writes.filter(p=>p.command===0x0418)).toHaveLength(count);
  });
  it('blocks duplicate names, full lists and missing custom-EQ capabilities',async()=>{
    const mock=device(); const {result}=await connect();
    for(const name of ['One','Two','Three']) await act(async()=>{expect(await result.current.saveNamedCustomEQ(null,name,[0,0,0,0,0,0])).toBe(true);});
    const count=mock.writes.filter(p=>p.command===0x0418).length;
    await act(async()=>{expect(await result.current.saveNamedCustomEQ(null,'one',[0,0,0,0,0,0])).toBe(false);});
    await act(async()=>{expect(await result.current.saveNamedCustomEQ(null,'Four',[0,0,0,0,0,0])).toBe(false);});
    expect(mock.writes.filter(p=>p.command===0x0418)).toHaveLength(count);
    const unsupported=device(undefined,false); const other=await connect();
    await act(async()=>{expect(await other.result.current.saveNamedCustomEQ(null,'One',[0,0,0,0,0,0])).toBe(false);});
    expect(unsupported.writes.some(p=>p.command===0x0418)).toBe(false);
  });
  it('identifies standard Air 7 and reads ANC, battery and hold settings',async()=>{
    device(); const {result}=await connect();
    expect(result.current.state.air7).toBe(true);
    expect(result.current.state.ancStrength).toBe(32);
    expect(result.current.state.touch.leftHold).toBe(8);
    expect(result.current.state.battery).toEqual({left:90,right:80,case:70});
  });
  it('sets all four strengths and preserves the last strength across Off/On',async()=>{
    const mock=device(); const {result}=await connect();
    for(const strength of [8,16,4,32]) {
      await act(async()=>{expect(await result.current.setANCStrength(strength)).toBe(true);});
      expect(result.current.state.ancStrength).toBe(strength);
    }
    await act(async()=>{await result.current.setANCStrength(16);await result.current.setANC(1);});
    expect(result.current.state.ancStrength).toBe(16);
    await act(async()=>{await result.current.setANC(8);});
    expect(mock.writes.filter(p=>p.command===0x0404).at(-1)?.payload).toEqual([1,1,16]);
  });
  it('rejects device refusal and accepted-but-unapplied writes',async()=>{
    const mock=device(); const {result}=await connect(); mock.ignore();
    await act(async()=>{expect(await result.current.setANCStrength(4)).toBe(false);});
    expect(result.current.state.ancStrength).toBe(32); mock.reject();
    await act(async()=>{expect(await result.current.setANCStrength(16)).toBe(false);});
    expect(result.current.state.ancStrength).toBe(32);
  });
  it('saves hold and preserves every unmodified gesture including call controls',async()=>{
    const mock=device(); const {result}=await connect();
    await act(async()=>{expect(await result.current.applyTouch(1,{4:3})).toBe(true);});
    const payload=mock.writes.find(p=>p.command===0x0401)!.payload;
    expect(payload).toEqual([7,1,1,2,1,1,1,3,6,1,1,4,3,2,1,2,1,2,1,3,6,2,1,4,8,4,6,2,29]);
    expect(result.current.state.touch.leftHold).toBe(3);
  });
  it('blocks Pro and disconnected writes',async()=>{
    const mock=device([0x12,0x4c,0x06]); const {result}=await connect();
    await act(async()=>{expect(await result.current.setANCStrength(4)).toBe(false);});
    expect(mock.writes.some(p=>p.command===0x0404)).toBe(false);
    const other=renderHook(()=>useSerial());
    await act(async()=>{expect(await other.result.current.applyTouch(1,{4:8})).toBe(false);});
  });
  it('ignores hold-cycle pushes, accepts ANC and battery pushes',async()=>{
    const mock=device(); const {result}=await connect();
    await act(async()=>{mock.push([3,2,1,10]);}); expect(result.current.state.ancMode).toBe(32);
    await act(async()=>{mock.push([3,1,1,4]);mock.push([1,1,1,75]);});
    await waitFor(()=>expect(result.current.state.ancStrength).toBe(4));
    expect(result.current.state.battery.left).toBe(75);
  });
  it('times out an unmatched reply instead of claiming success',async()=>{
    const mock=device(); const {result}=await connect(); mock.wrong();
    vi.useFakeTimers();
    try {
      let outcome: Promise<boolean>;
      await act(async()=>{outcome=result.current.setANCStrength(4);});
      await act(async()=>{await vi.advanceTimersByTimeAsync(6001);});
      expect(await outcome!).toBe(false);
      expect(result.current.state.ancStrength).toBe(32);
      expect(result.current.state.busy).toBe(false);
    } finally { vi.useRealTimers(); }
  });
});
