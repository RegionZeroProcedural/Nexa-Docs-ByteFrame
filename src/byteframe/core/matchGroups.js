/** Display-only byte-pattern searches within an already loaded window. */
export const MAX_PATTERN_BYTES = 32;
export const MAX_MATCH_GROUPS = 8;
export function matchPattern(windowBytes, pattern) {
  if (!(windowBytes instanceof Uint8Array) || !pattern?.length || pattern.length > MAX_PATTERN_BYTES) return [];
  const found = [];
  const p = pattern instanceof Uint8Array ? pattern : Uint8Array.from(pattern);
  outer: for (let i = 0; i <= windowBytes.length - p.length; i++) {
    for (let j = 0; j < p.length; j++) if (windowBytes[i + j] !== p[j]) continue outer;
    found.push(i);
  }
  return found;
}
export function buildByteMatchMap(windowBytes, groups = []) {
  const result = new Map();
  if (!(windowBytes instanceof Uint8Array)) return result;
  groups.forEach((group, index) => {
    const occurrences = matchPattern(windowBytes, group.bytes);
    for (const position of occurrences) for (let n = 0; n < group.bytes.length; n++)
      result.set(position + n, index % MAX_MATCH_GROUPS);
  });
  return result;
}
export function byteHistogram(bytes) {
  const counts = new Uint32Array(256);
  if (bytes) for (const value of bytes) counts[value]++;
  return counts;
}
