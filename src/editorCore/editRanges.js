/** Inclusive start / exclusive end in UTF-16 document offsets. All styles live
 * in range metadata, never as per-character objects. */
export const TOGGLE_TYPES = ['bold', 'italic', 'underline', 'strike'];
export const VALUE_TYPES = ['color', 'highlight', 'font', 'size', 'link', 'script'];
export const FORMAT_TYPES = [...TOGGLE_TYPES, ...VALUE_TYPES];
let nextId = 1;
const freshId = () => `f-${Date.now().toString(36)}-${nextId++}`;

export function normalizeRanges(ranges) {
  const ordered = ranges.filter(r => FORMAT_TYPES.includes(r.type) && r.end > r.start)
    .map(r => ({ ...r }))
    .sort((a, b) => a.type.localeCompare(b.type) || String(a.value ?? '').localeCompare(String(b.value ?? '')) || a.start - b.start || a.end - b.end);
  const result = [];
  for (const r of ordered) {
    const prev = result[result.length - 1];
    if (prev && prev.type === r.type && prev.value === r.value && r.start <= prev.end) {
      prev.end = Math.max(prev.end, r.end);
    } else result.push(r);
  }
  return result.sort((a, b) => a.start - b.start || a.end - b.end || a.type.localeCompare(b.type));
}

export function isRangeFormatted(ranges, start, end, type) {
  if (start >= end) return false;
  let cursor = start;
  for (const r of [...ranges].filter(r => r.type === type).sort((a, b) => a.start - b.start)) {
    if (r.end <= cursor) continue;
    if (r.start > cursor) return false;
    cursor = Math.max(cursor, r.end);
    if (cursor >= end) return true;
  }
  return false;
}

/** Keep the original compatibility contract for toggle marks. */
export function marksAtCaret(ranges, position) {
  return TOGGLE_TYPES.filter(type => ranges.some(r => r.type === type && r.start < position && r.end >= position));
}

export function formatsAtCaret(ranges, position) {
  return ranges.filter(r => r.start < position && r.end >= position).map(r => ({ type: r.type, value: r.value }));
}

export function valueAtPosition(ranges, position, type, fallback = null) {
  const r = ranges.find(r => r.type === type && r.start <= position && position < r.end)
    || ranges.find(r => r.type === type && r.start < position && position <= r.end);
  return r ? r.value : fallback;
}

/** Replace just one attribute in a selection; preserves unrelated marks. */
export function setRangeAttribute(ranges, start, end, type, value) {
  if (!FORMAT_TYPES.includes(type) || start >= end) return ranges;
  const out = [];
  for (const r of ranges) {
    if (r.type !== type || r.end <= start || r.start >= end) { out.push(r); continue; }
    if (r.start < start) out.push({ ...r, end: start });
    if (r.end > end) out.push({ ...r, id: freshId(), start: end });
  }
  if (value !== null && value !== undefined && value !== false && value !== '') {
    out.push({ id: freshId(), type, start, end, ...(value === true ? {} : { value }) });
  }
  return normalizeRanges(out);
}

export function toggleRange(ranges, start, end, type) {
  if (!TOGGLE_TYPES.includes(type) || start >= end) return ranges;
  return setRangeAttribute(ranges, start, end, type, !isRangeFormatted(ranges, start, end, type));
}

export function clearRangeFormatting(ranges, start, end) {
  return FORMAT_TYPES.reduce((next, type) => setRangeAttribute(next, start, end, type, null), ranges);
}
