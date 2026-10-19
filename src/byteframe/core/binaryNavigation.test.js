import { normalizeBinaryOffset, regionAtOffset, rawByteCategory, instructionIndexForWindow } from './binaryNavigation';

test('section jumps may seek past the analyzed header up to the end of a file', () => {
  expect(normalizeBinaryOffset(0x200000, 0x400000)).toBe(0x200000);
  expect(normalizeBinaryOffset(0x400000, 0x400000)).toBeNull();
  expect(normalizeBinaryOffset(-1, 10)).toBeNull();
  expect(normalizeBinaryOffset(Infinity, 10)).toBeNull();
  expect(normalizeBinaryOffset(0, 0)).toBeNull();
});

test('specific code sections win over enclosing ranges', () => {
  const outer = { name: 'Whole segment', start: 0x100, size: 0x500, kind: 'segment' };
  const code = { name: '.text', start: 0x200, size: 0x200, kind: 'code' };
  expect(regionAtOffset([outer, code], 0x240)).toBe(code);
  expect(regionAtOffset([outer, code], 0x500)).toBe(outer);
  expect(regionAtOffset([outer, code], 0x600)).toBeNull();
});

test('unknown bytes have stable non-executable classifications', () => {
  expect([0x00, 0x41, 0x01, 0xff].map(rawByteCategory)).toEqual(['zero', 'ascii', 'control', 'high']);
});


test('instruction colors survive a jump to code beyond the loaded file prefix', () => {
  const code = { name: '.text', start: 0x200000, size: 0x100, kind: 'code' };
  const header = { name: 'DOS header', start: 0, size: 0x40, kind: 'header' };
  const bytes = Uint8Array.from([0x48, 0x83, 0xc0, 0x05]);
  const fakeDecoder = () => ({ size: 4, mnemonic: 'ADD', roles: ['prefix', 'opcode', 'modrm', 'immediate'] });
  const classify = mnemonic => mnemonic === 'ADD' ? 'arithmetic' : 'unknown';
  const colored = instructionIndexForWindow(bytes, 0x200000, [header, code], fakeDecoder, classify);
  expect(colored.size).toBe(4);
  expect(colored.get(0x200001)).toMatchObject({category:'arithmetic',role:'opcode'});
  expect(colored.get(0x200003)).toMatchObject({category:'arithmetic',role:'immediate'});
  expect(instructionIndexForWindow(bytes, 0, [header, code], fakeDecoder, classify).size).toBe(0);
});
