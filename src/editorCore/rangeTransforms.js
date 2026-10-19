import { normalizeRanges } from './editRanges';
let serial = 0;
/** Maps old metadata through a replace, then applies inherited formatting only
 * to inserted text. Works for toggles and value-bearing marks alike. */
export function transformRangesForReplace(ranges, from, to, insertedLength, insertedFormats = []) {
  // Edits strictly after the final formatting mark cannot affect any range.
  // Preserve the array identity so unaffected paragraphs can skip React renders.
  if ((!insertedFormats || !insertedFormats.length) &&
      (!ranges.length || ranges.every(range => range.end <= from))) return ranges;
  const removed = to - from;
  const mapDelete = pos => pos <= from ? pos : pos >= to ? pos - removed : from;
  const mapped = [];
  for (const r of ranges) {
    let start = mapDelete(r.start);
    let end = mapDelete(r.end);
    if (insertedLength) {
      if (start >= from) start += insertedLength;
      if (end > from) end += insertedLength;
    }
    if (end > start) mapped.push({ ...r, start, end });
  }
  for (const entry of insertedFormats) {
    const format = typeof entry === 'string' ? { type: entry } : entry;
    if (insertedLength && format?.type) mapped.push({ id: `insert-${serial++}`, start: from, end: from + insertedLength, ...format });
  }
  return normalizeRanges(mapped);
}

export function transformAnnotationRanges(items, from, to, insertedLength) {
  if (!items?.length || items.every(item => item.end <= from)) return items || [];
  const removed = to - from;
  const point = pos => pos <= from ? pos : pos >= to ? pos - removed : from;
  return (items || []).map(item => ({ ...item,
    start: point(item.start) + (item.start >= from ? insertedLength : 0),
    end: point(item.end) + (item.end > from ? insertedLength : 0),
  })).filter(item => item.end > item.start);
}
