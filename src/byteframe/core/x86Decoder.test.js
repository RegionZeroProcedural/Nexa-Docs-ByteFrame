import { decodeX86At, instructionCategory } from './x86Decoder';
import { instructionIndexForWindow } from './binaryNavigation';
import { inspectBinaryStructure } from './binaryStructure';
import { resolveRelativeTarget } from './addressMapping';
import { overlayByteEdits, putByteEdit } from './binaryEdits';

const decode = (data, mode = 64) => decodeX86At(Uint8Array.from(data),0,{mode});

test.each([
  [[0xEB,0x96], 'JMP', -106, 2, 8],
  [[0xE9,0x96,0xFF,0xFF,0xFF], 'JMP', -106, 5, 32],
  [[0xE9,0x96,0xE9,0x35,0x00], 'JMP', 3533206, 5, 32],
  [[0xE8,0x10,0x00,0x00,0x00], 'CALL', 16, 5, 32],
  [[0x0F,0x85,0x10,0x00,0x00,0x00], 'JNE', 16, 6, 32],
])('relative branch %p is decoded completely', (bytes, mnemonic, delta, length, width) => {
  const i = decode(bytes);
  expect(i).toMatchObject({mnemonic,displacement:delta,size:length,displacementWidth:width,mode:64});
  expect(i.roles.filter(r=>r==='displacement')).toHaveLength(width / 8);
  expect(i.nextOffset).toBe(length);
  expect(i.target).toBe(length+delta);
});

test('truncated E9 does not become an 8-bit jump or read beyond the input', () => {
  expect(decode([0xE9,0x96])).toMatchObject({incomplete:true,size:2,expectedSize:5,mode:64});
  expect(decode([0x0F,0x85,0x10])).toMatchObject({incomplete:true,size:3,expectedSize:6});
  expect(decode([0xEB])).toMatchObject({incomplete:true,size:1,expectedSize:2});
});

test('16-bit, 32-bit and 64-bit decoding respects operand size overrides', () => {
  expect(decode([0xE9,0x34,0x12],16)).toMatchObject({size:3,displacement:0x1234,displacementWidth:16});
  expect(decode([0x66,0xE9,0x34,0x12],32)).toMatchObject({size:4,displacementWidth:16});
  expect(decode([0x66,0xE9,0x10,0,0,0],16)).toMatchObject({size:6,displacementWidth:32});
  expect(decode([0x66,0xE9,0x10,0,0,0],64)).toMatchObject({size:6,displacementWidth:32});
  expect(decode([0x0F,0x85,0xFF,0xFF],16)).toMatchObject({size:4,displacement:-1,displacementWidth:16});
  expect(decode([0x48],32)).toMatchObject({mnemonic:'DEC',operands:'EAX',size:1}); // INC/DEC encodings are not REX in 32-bit mode.
});

function peFixture(machine = 0x8664, magic = 0x20B) {
  const b = new Uint8Array(0x450);
  b[0]=0x4D; b[1]=0x5A;
  const write=(p,value,width)=>{ for(let k=0;k<width;k++) b[p+k]=Math.floor(value / 2**(8*k)) & 0xFF; };
  write(0x3C,0x80,4); b.set([0x50,0x45,0,0],0x80);
  write(0x84,machine,2); write(0x86,1,2); write(0x94,magic===0x20B?240:224,2);
  const opt=0x98; write(opt,magic,2); write(opt+(magic===0x20B?24:28),0x400000,4);
  const sect=opt+(magic===0x20B?240:224);
  b.set([0x2E,0x74,0x65,0x78,0x74,0,0,0],sect);
  write(sect+8,0x80,4); write(sect+12,0x1000,4);
  write(sect+16,0x50,4); write(sect+20,0x400,4);
  write(sect+36,0x60000020,4);
  b.set([0xCC,0xCC,0xCC,0xCC,0xCC,0xE9,0x96,0xE9,0x35,0],0x400);
  return b;
}

test('PE COFF machine chooses mode and maps file offsets to RVAs', () => {
  const b=peFixture(); const s=inspectBinaryStructure(b);
  expect(s.architecture.mode).toBe(64);
  const decoded=instructionIndexForWindow(b.subarray(0x400,0x450),0x400,s.sections,decodeX86At,instructionCategory,s);
  const op=decoded.get(0x405);
  expect(op).toMatchObject({start:0x405,size:5,mnemonic:'JMP',displacement:3533206});
  for(let i=0;i<5;i++) {
    expect(decoded.get(0x405+i).start).toBe(0x405);
    expect(decoded.get(0x405+i).role).toBe(i?'displacement':'opcode');
  }
  const target=resolveRelativeTarget(s,0x405,op);
  expect(target.rva).toBe(0x100A + 3533206);
  expect(target.virtualAddress).toBe(0x400000+target.rva);
  expect(target.fileOffsetTarget).toBeNull(); // No inferred physical target outside mapped section.
  expect(inspectBinaryStructure(peFixture(0x14c,0x10b)).architecture.mode).toBe(32);
  expect(inspectBinaryStructure(peFixture(0x1c0,0x10b)).architecture.mode).toBeNull();
});

test('unknown PE architecture never receives arbitrary x86 instruction coloring', () => {
  const b=peFixture(0x1c0,0x10b),structure=inspectBinaryStructure(b);
  const index=instructionIndexForWindow(b.subarray(0x400),0x400,structure.sections,decodeX86At,instructionCategory,structure);
  expect(index.size).toBe(0);
});

test('staged byte edits trigger re-decoding without changing source bytes', () => {
  const original=peFixture(),structure=inspectBinaryStructure(original);
  const patches=putByteEdit(new Map(),0x409,0x01,0x00);
  const changed=overlayByteEdits(original,0,patches);
  expect(original[0x409]).toBe(0);
  const idx=instructionIndexForWindow(changed.subarray(0x400),0x400,structure.sections,decodeX86At,instructionCategory,structure);
  expect(idx.get(0x405).displacement).toBe(0x0135E996);
});
