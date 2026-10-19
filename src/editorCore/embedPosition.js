/** Map an existing logical caret to a visual page coordinate without moving focus.
 * Layout is expressed in CSS page pixels; absolute offsets remain the source of truth. */
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export function locateEmbedAtCaret(editorRoot, offset) {
  const pieces = [...(editorRoot?.querySelectorAll('[data-editor-fragment]') || [])];
  let piece = pieces.find(node => Number(node.dataset.fragmentStart) <= offset && Number(node.dataset.fragmentEnd) >= offset);
  if (!piece) piece = pieces[pieces.length - 1];
  const page = piece?.closest('.paper-page');
  if (!page) return { position: null, pageIndex: 0 };
  const pageRect = page.getBoundingClientRect();
  const scale = page.clientWidth ? pageRect.width / page.clientWidth : 1;
  let caret = piece.getBoundingClientRect();
  try {
    const relative = clamp(offset - Number(piece.dataset.fragmentStart || 0), 0, (piece.textContent || '').length);
    const walker = document.createTreeWalker(piece, NodeFilter.SHOW_TEXT);
    let rest = relative, node = walker.nextNode();
    while (node && rest > (node.textContent || '').length) { rest -= node.textContent.length; node = walker.nextNode(); }
    if (node) { const range = document.createRange(); range.setStart(node, clamp(rest, 0, node.textContent.length)); range.collapse(true); caret = range.getBoundingClientRect(); }
  } catch { /* Empty or replaced text nodes: use containing paragraph. */ }
  const left = (caret.left - pageRect.left) / scale;
  const top = (caret.top - pageRect.top) / scale;
  return { pageIndex: Math.max(0, Number(page.closest('[data-page-number]')?.dataset.pageNumber || 1) - 1),
    position: { x: Math.round(clamp(left, 12, Math.max(12, page.clientWidth - 220))),
      y: Math.round(clamp(top + 22, 12, Math.max(12, page.clientHeight - 180))) } };
}
