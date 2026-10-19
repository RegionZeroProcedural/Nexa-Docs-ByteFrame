/** Layout-only pagination. Text and formatting remain in a single, unchanged document model.
 * measure(part, first) returns rendered CSS height of a paragraph slice, including margins.
 * Calls to measure may use a DOM mirror or deterministic test stub. */
export function documentLines(text) {
  let offset = 0;
  return text.split('\n').map((line, lineIndex) => {
    const result = { lineIndex, start: offset, end: offset + line.length, text: line };
    offset += line.length + 1;
    return result;
  });
}

export function paginateLines(text, availableHeight, measure, maxPages = 2000, options = {}) {
  const lines = documentLines(text);
  const pages = [{ fragments: [] }];
  const available = Math.max(24, availableHeight);
  let remaining = available;
  const newPage = () => {
    if (pages.length >= maxPages) return false;
    pages.push({ fragments: [] }); remaining = available; return true;
  };
  for (const line of lines) {
    // An explicit page break is part of the paragraph model, never the text.
    if (options.breakBefore?.(line.lineIndex)) {
      if (pages[pages.length - 1].fragments.length && !newPage()) break;
      pages[pages.length - 1].forced = true;
    }
    // An empty paragraph is still a real editor line, including the last blank line.
    let start = line.start;
    let continuation = false;
    let safety = 0;
    do {
      if (++safety > line.text.length + 10) break;
      const fitting = (end) => measure({ lineIndex: line.lineIndex, start, end, continued: continuation }, !continuation);
      let end = line.end;
      let height = fitting(end);
      if (height > remaining + 0.5 && pages[pages.length - 1].fragments.length) {
        // Keep ordinary short paragraphs intact when they fit on a new page,
        // but let oversized paragraphs occupy the remaining space first.
        const firstCharEnd = Math.min(line.end, start + 1);
        const cannotFitFirstCharacter = fitting(firstCharEnd) > remaining + 0.5;
        if (height <= available + 0.5 || cannotFitFirstCharacter) {
          if (!newPage()) break;
          height = fitting(end);
        }
      }
      if (height > remaining + 0.5 && start < line.end) {
        // Binary-search the longest text fragment that can fit on this sheet.
        let low = start + 1, high = line.end;
        let best = start;
        while (low <= high) {
          const mid = Math.floor((low + high) / 2);
          if (fitting(mid) <= remaining + 0.5) { best = mid; low = mid + 1; }
          else high = mid - 1;
        }
        if (best === start) best = Math.min(line.end, start + 1);
        // Avoid splitting a UTF-16 surrogate pair (e.g. an emoji).
        if (best < line.end && best > start && /[\uD800-\uDBFF]/.test(text[best - 1]) && /[\uDC00-\uDFFF]/.test(text[best])) best = Math.min(line.end, best + 1);
        // Prefer whole words when it doesn't discard more than a short trailing word.
        if (best < line.end && best - start > 15) {
          const lastSpace = text.lastIndexOf(' ', best - 1);
          if (lastSpace > start && best - lastSpace < 22) best = lastSpace + 1;
        }
        end = best;
        height = fitting(end);
      }
      pages[pages.length - 1].fragments.push({ lineIndex: line.lineIndex, start, end, continued: continuation });
      remaining -= Math.min(remaining, Math.max(0, height));
      if (end >= line.end) break;
      start = end;
      continuation = true;
      if (!newPage()) break;
    } while (start < line.end);
  }
  return pages;
}

/** Group measured column-flow slots into physical pages. Explicit page breaks
 * always start a new physical page, not merely another column. */
export function groupColumns(flowPages, count = 1) {
  const columns = Math.min(3, Math.max(1, Math.floor(Number(count) || 1)));
  const result = [];
  let current = [];
  const flush = () => { if (current.length) { result.push({ columns: current }); current = []; } };
  for (const slot of flowPages) {
    if (slot.forced) flush();
    current.push({ fragments: slot.fragments });
    if (current.length === columns) flush();
  }
  flush();
  return result.length ? result : [{ columns: [{ fragments: [] }] }];
}
