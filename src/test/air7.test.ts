import { describe, it, expect } from 'vitest';
import { ANC_STRENGTHS, actionsFor, editGestures, encodePacket, PacketReader, parseGestures, parseCustomEQ, saveCustomEQ, supports, createCustomEQ, encodeEQName, sameEQPresets } from '@/lib/air7';

describe('Air 7 interoperability', () => {
  it('creates custom EQ with model frequencies, UTF-8 byte names and signed gains',()=>{
    const payload=createCustomEQ('Café',[0,1,2,-1,-2,-3]);
    expect(payload.slice(0,11)).toEqual([1,250,6,0,5,67,97,102,195,169,6]);
    expect(payload.slice(11,14)).toEqual([62,0,0]);
    expect(payload.at(-1)).toBe(253);
    expect(()=>encodeEQName(' ')).toThrow();
    expect(()=>encodeEQName('🎵'.repeat(9))).toThrow();
    expect(()=>encodeEQName('Hello\nWorld')).toThrow();
    expect(()=>createCustomEQ('Bad',[7,0,0,0,0,0])).toThrow();
  });
  it('compares complete preset contents while allowing device ID renumbering',()=>{
    const preset=parseCustomEQ([0,1,0,250,6,4,1,88,6,...[62,250,1000,4000,8000,16000].flatMap(f=>[f&255,f>>8,0])])[0];
    expect(sameEQPresets([preset],[{...preset,id:9,selected:1}])).toBe(true);
    expect(sameEQPresets([preset],[{...preset,name:[89]}])).toBe(false);
    expect(sameEQPresets([preset,preset],[preset])).toBe(false);
  });
  it('uses the standard Air 7 strength slots and distinct gesture menus', () => {
    expect(ANC_STRENGTHS.map(s=>[s.label,s.value])).toEqual([['Smart',32],['Max',8],['Moderate',16],['Mild',4]]);
    expect(actionsFor(4).map(a=>a.value)).toEqual([0,3,8,17]);
    expect(actionsFor(2).some(a=>a.value===8)).toBe(false);
    expect(actionsFor(3).some(a=>a.value===1)).toBe(false);
  });
  it('preserves all unchanged, other-ear and call rows in whole-table writes', () => {
    const table=parseGestures([0,4,1,1,2,1,1,1,4,8,2,1,4,8,4,6,2,29]);
    expect(editGestures(table,1,{4:3})).toEqual([4,1,1,2,1,1,1,4,3,2,1,4,8,4,6,2,29]);
    expect(()=>editGestures(table,1,{3:1})).toThrow();
    expect(()=>editGestures(table,2,{3:5})).toThrow();
    expect(()=>parseGestures([0,2,1,1,4,8])).toThrow();
  });
  it('handles partial, coalesced, multi-byte-length and malformed frames', () => {
    const framer=new PacketReader(), payload=Array(130).fill(0);
    const big=encodePacket(0x8108,14,payload), small=encodePacket(0x810c,15,[0,1,1,32]);
    expect(framer.feed(big.slice(0,4))).toEqual([]);
    expect(framer.feed(new Uint8Array([...big.slice(4),...small]))).toEqual([
      {command:0x8108,seq:14,payload}, {command:0x810c,seq:15,payload:[0,1,1,32]},
    ]);
    expect(framer.feed(new Uint8Array([0xaa,0,0xaa,7,0,0,12,129,1,2,0]))).toEqual([]);
  });
  it('reassembles protocol slices', () => {
    const framer=new PacketReader();
    expect(framer.feed(new Uint8Array([0xaa,7,1,0,0,12,129,5,4]))).toEqual([]);
    expect(framer.feed(new Uint8Array([0xaa,8,3,0,1,0,0,1,1,32]))).toEqual([{command:0x810c,seq:5,payload:[0,1,1,32]}]);
  });
  it('gates writes on command bitmap', () => {
    expect(supports([],0x0404)).toBe(false);
    expect(supports([0,1],0x0404)).toBe(true);
    expect(supports([8],0x0401)).toBe(true);
  });
  it('preserves custom EQ id, name and frequencies rather than using Air 5 constants', () => {
    const raw=[0,1,1,250,6,7,1,88,6,...[62,250,1000,4000,8000,16000].flatMap(f=>[f&255,f>>8,0])];
    const preset=parseCustomEQ(raw)[0];
    const saved=saveCustomEQ(preset,[1,-1,2,-2,3,-3]);
    expect(saved.slice(0,8)).toEqual([2,250,6,7,1,88,6,62]);
    expect(saved.at(-1)).toBe(253);
    expect(()=>parseCustomEQ(raw.slice(0,-1))).toThrow();
  });
});
