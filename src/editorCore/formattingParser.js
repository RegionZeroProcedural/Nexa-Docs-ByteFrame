/** Resolve only visible paragraph text into spans with uniform styles. */
export function getTextRuns(text, formats, absoluteStart, comments = []) {
  if (!text.length) return [];
  const end = absoluteStart + text.length;
  const boundaries = new Set([absoluteStart, end]);
  for (const f of [...formats, ...comments]) {
    if (f.end <= absoluteStart || f.start >= end) continue;
    boundaries.add(Math.max(absoluteStart, f.start));
    boundaries.add(Math.min(end, f.end));
  }
  const sorted = [...boundaries].sort((a, b) => a - b);
  return sorted.slice(0, -1).map((from, i) => {
    const to = sorted[i + 1];
    const applied = formats.filter(f => f.start <= from && f.end >= to);
    return {
      from, to,
      text: text.slice(from - absoluteStart, to - absoluteStart),
      marks: applied.map(f => f.type),
      attributes: Object.fromEntries(applied.filter(f => f.value !== undefined).map(f => [f.type, f.value])),
      commented: comments.some(c => c.start <= from && c.end >= to && !c.resolved),
    };
  });
}
