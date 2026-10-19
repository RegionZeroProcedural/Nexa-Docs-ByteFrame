import { extractBinaryPrefix, inspectBinaryStructure } from './binaryStructure';

test('recognizes ASCII annotated offsets without treating offset labels as bytes', () => {
  const result = extractBinaryPrefix('00000000  4D 5A 90 00\n00000004  00 00 00 00');
  expect(Array.from(result.bytes)).toEqual([0x4d, 0x5a, 0x90, 0, 0, 0, 0, 0]);
  expect(result.sourcePositions[0]).toBe(10);
});
test('detects structural PNG chunks and WebAssembly code sections', () => {
  const png = Uint8Array.from([0x89,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,6,0,0,0,0,0,0,0,0]);
  expect(inspectBinaryStructure(png).sections.map(s => s.name)).toContain('IHDR');
  const wasm = Uint8Array.from([0,97,115,109,1,0,0,0,10,2,1,0]);
  expect(inspectBinaryStructure(wasm).sections.map(s => s.name)).toContain('Code');
});
test('does not infer a file format from arbitrary machine code', () => {
  expect(inspectBinaryStructure([0x48,0x83,0xc0,0x05]).format).toBeNull();
});
