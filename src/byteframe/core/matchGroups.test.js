import { matchPattern, buildByteMatchMap, byteHistogram } from './matchGroups';
test('finds all occurrences, including contiguous repeated values', () => {
 const bytes=Uint8Array.from([0xCC,0xCC,0x90,0xCC,0x90,0xCC]);
 expect(matchPattern(bytes,[0xCC])).toEqual([0,1,3,5]);
 expect(matchPattern(bytes,[0xCC,0x90])).toEqual([1,3]);
 expect(matchPattern(bytes,[0x90,0x90])).toEqual([]);
 expect(byteHistogram(bytes)[0xCC]).toBe(4);
});
test('multiple pinned groups retain independent colors', () => {
 const bytes=Uint8Array.from([0xE9,0x00,0xE9,0xCC]);
 const matched=buildByteMatchMap(bytes,[{bytes:[0xE9]},{bytes:[0xCC]}]);
 expect(matched.get(0)).toBe(0); expect(matched.get(2)).toBe(0);
 expect(matched.get(3)).toBe(1);
});
test('rejects empty or oversized patterns and incomplete matches', () => {
 expect(matchPattern(Uint8Array.from([0xE9,0x10]),[0xE9,0x10,0x00])).toEqual([]);
 expect(matchPattern(Uint8Array.from([0x01]),[])).toEqual([]);
 expect(matchPattern(Uint8Array.from([0x01]),new Array(33).fill(1))).toEqual([]);
});
