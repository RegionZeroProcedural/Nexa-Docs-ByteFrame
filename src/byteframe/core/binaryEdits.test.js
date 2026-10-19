import { putByteEdit, overlayByteEdits, buildPatchedBinaryBlob } from './binaryEdits';

test('byte replacement and undo are immutable', () => {
  const original = new Map();
  const patched = putByteEdit(original, 2, 0xFF, 0x03);
  expect(original.size).toBe(0);
  expect(patched.get(2)).toBe(255);
  expect(putByteEdit(patched, 2, 3, 3).size).toBe(0);
});
test('a patched file retains its exact length and all untouched bytes', async () => {
  const source = new Blob([Uint8Array.from([0,1,2,3,4,5,6,7,8,9])]);
  let patches = new Map();
  patches = putByteEdit(patches, 1, 90, 1);
  patches = putByteEdit(patches, 2, 91, 2);
  patches = putByteEdit(patches, 8, 92, 8);
  const result = buildPatchedBinaryBlob(source, patches);
  expect(result.size).toBe(source.size);
  expect([...new Uint8Array(await result.arrayBuffer())]).toEqual([0,90,91,3,4,5,6,7,92,9]);
  expect([...new Uint8Array(await source.arrayBuffer())]).toEqual([0,1,2,3,4,5,6,7,8,9]);
  expect([...overlayByteEdits(new Uint8Array([1,2,3,4]),1,patches)]).toEqual([90,91,3,4]);
});
test('reject patches outside the original file', () => {
  expect(() => buildPatchedBinaryBlob(new Blob([new Uint8Array(2)]), new Map([[2, 3]]))).toThrow();
});
