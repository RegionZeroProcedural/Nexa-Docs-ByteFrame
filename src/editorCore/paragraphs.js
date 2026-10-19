/** Paragraph metadata is separate from visual pages and character ranges. */
export const DEFAULT_PARAGRAPH = Object.freeze({ style: 'normal', align: 'left', spacing: 1.5, list: 'none', indent: 0, firstLineIndent: 0, rightIndent: 0, checked: false, pageBreakBefore: false, borderBottom: false, spaceBefore: 0, spaceAfter: 0 });
export function lineStarts(text) {
  const result = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') result.push(i + 1);
  return result;
}
let cachedPositionsText = null;
let cachedPositions = null;
export function paragraphAt(text, offset) {
  // Selection changes must not rescan all bytes to find each preceding newline.
  if (text !== cachedPositionsText) {
    cachedPositionsText = text;
    cachedPositions = lineStarts(text);
  }
  const starts = cachedPositions;
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
export function paragraphsForText(text, existing = []) {
  return lineStarts(text).map((_, i) => ({ ...DEFAULT_PARAGRAPH, ...(existing[i] || {}) }));
}
/** Maps each resulting paragraph back to its source during text replacement.
 * A newly inserted newline inherits the preceding paragraph's style. */
export function transformParagraphs(oldText, newText, paragraphs, from, to, insertionLength) {
  // Ordinary typing within a paragraph never changes the paragraph structure.
  // Preserve the existing metadata array instead of scanning the entire text
  // for newline boundaries on every keystroke.
  if (Array.isArray(paragraphs) &&
      !oldText.slice(from, to).includes('\n') &&
      !newText.slice(from, from + insertionLength).includes('\n')) return paragraphs;
  const oldStarts = lineStarts(oldText);
  const newStarts = lineStarts(newText);
  const removed = to - from;
  // Both arrays are in ascending document order. Keep a moving pointer into
  // the old paragraph starts rather than rescanning them for EVERY new line.
  // This reduces large-document edits from O(paragraphs²) to O(paragraphs).
  let oldIndex = 0;
  return newStarts.map(start => {
    const source = start <= from ? start : start <= from + insertionLength ? from : start - insertionLength + removed;
    while (oldIndex + 1 < oldStarts.length && oldStarts[oldIndex + 1] <= source) oldIndex++;
    return { ...DEFAULT_PARAGRAPH, ...(paragraphs?.[oldIndex] || {}) };
  });
}
/** Selection ending at the beginning of another paragraph excludes that paragraph. */
export function selectedParagraphIndexes(text, start, end) {
  const first = paragraphAt(text, start);
  const last = paragraphAt(text, end > start ? end - 1 : end);
  return Array.from({ length: last - first + 1 }, (_, i) => first + i);
}
export function setParagraphProperty(text, existing, start, end, key, value) {
  const paragraphs = paragraphsForText(text, existing);
  selectedParagraphIndexes(text, start, end).forEach(i => { paragraphs[i] = { ...paragraphs[i], [key]: value }; });
  return paragraphs;
}
