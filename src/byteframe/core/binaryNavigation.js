import { resolveRelativeTarget } from './addressMapping';
/** File offsets are physical byte offsets; preview size is only the cached header. */
export function normalizeBinaryOffset(value, fileSize) {
  if (!Number.isSafeInteger(fileSize) || fileSize < 0 || !Number.isSafeInteger(value) || value < 0 || value >= fileSize) return null;
  return value;
}

/** Prefer the most specific identified region if structural records overlap. */
export function regionAtOffset(sections = [], offset) {
  const matches = sections.filter(s => Number.isSafeInteger(s.start) && Number.isSafeInteger(s.size) && s.size > 0 && offset >= s.start && offset - s.start < s.size);
  const rank = kind => ({code:0, data:1, header:2, metadata:3, section:4, segment:5})[kind] ?? 6;
  return matches.sort((a, b) => rank(a.kind) - rank(b.kind) || a.size - b.size)[0] || null;
}

export const rawByteCategory = value => value === 0 ? 'zero' : value >= 32 && value <= 126 ? 'ascii' : value < 32 || value === 127 ? 'control' : 'high';


/** Classify decoded machine bytes within confirmed executable ranges only.
 * Section addresses and the visible window offset must use file offsets;
 * unknown bytes are left to their safe raw-byte coloring fallback. */
export function instructionIndexForWindow(windowBytes, fileOffset, sections, decode, categoryFor, structure = null) {
  const result = new Map();
  if (!(windowBytes instanceof Uint8Array)) return result;
  if (structure?.architecture && ![16, 32, 64].includes(structure.architecture.mode)) return result;
  const mode = structure?.architecture?.mode || 64;
  let at = 0;
  while (at < windowBytes.length) {
    const absolute = fileOffset + at;
    const region = regionAtOffset(sections, absolute);
    if (region?.kind !== 'code') { at++; continue; }
    const instruction = decode(windowBytes, at, { mode });
    const size = instruction?.size || 1;
    if (instruction?.incomplete) {
      // Do not reinterpret an incomplete operand byte as a fresh opcode.
      const available = Math.min(size, region.start + region.size - absolute);
      const item = { ...instruction, start:absolute, category:'unknown',
        explanation: `${instruction.explanation} ${absolute + size >= fileOffset + windowBytes.length ? 'The next file window may contain additional bytes.' : ''}` };
      for (let i = 0; i < available; i++) result.set(absolute + i, {...item, role:instruction.roles?.[i] || 'unknown'});
      at += Math.max(available, 1);
      continue;
    }
    if (instruction && !instruction.incomplete && size > region.start + region.size - absolute) {
      // The current recognized encoding would cross the boundary of the
      // executable region. Keep its remaining bytes together as unknown.
      const available = Math.max(1, Math.min(region.start + region.size - absolute, windowBytes.length - at));
      const item = { incomplete:true, size:available, expectedSize:size, start:absolute,
        mnemonic:'Incomplete instruction',category:'unknown',roles:instruction.roles?.slice(0,available) || [],mode,
        explanation:'Instruction encoding crosses the end of the identified executable region; not treated as a complete instruction.' };
      for (let i=0;i<available;i++) result.set(absolute+i,{...item,role:item.roles[i] || 'unknown'});
      at += available;
      continue;
    }
    if (instruction && size > 0 && absolute + size <= region.start + region.size && at + size <= windowBytes.length) {
      const mapping = resolveRelativeTarget(structure, absolute, instruction);
      const item = { ...instruction, start: absolute, end: absolute + size, size,
        category: categoryFor(instruction.mnemonic), resolvedTarget:mapping };
      for (let i = 0; i < size; i++) result.set(absolute + i, { ...item, role: instruction.roles?.[i] || 'unknown' });
      at += size;
    } else at++;
  }
  return result;
}
