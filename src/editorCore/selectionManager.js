/** Mapping between one logical UTF-16 document and many independently rendered
 * page fragments. The visual page boundaries never add characters to the model. */
const fragmentsOf = root => root ? [...root.querySelectorAll('[data-editor-fragment]')] : [];
const extent = fragment => ({ start: Number(fragment.dataset.fragmentStart), end: Number(fragment.dataset.fragmentEnd) });

export function pointToOffset(root, node, nodeOffset) {
  // Normal caret/selection events should not query or scan thousands of page
  // fragments. The local containing paragraph is sufficient to find its
  // absolute logical UTF-16 position.
  const element = node?.nodeType === 1 ? node : node?.parentElement;
  const direct = element?.closest?.('[data-editor-fragment]');
  if (direct && root.contains(direct)) {
    const { start, end } = extent(direct);
    try {
      const range = document.createRange();
      range.selectNodeContents(direct);
      range.setEnd(node, nodeOffset);
      return Math.min(end, start + range.toString().length);
    } catch { return start; }
  }
  // Fallback applies only to atypical browser selections on page wrappers.
  const fragments = fragmentsOf(root);
  if (!fragments.length) return 0;
  if (node === root && nodeOffset === 0) return 0;
  // Selection between page wrappers (or after the last page) has no text node.
  if (root.contains(node)) {
    try {
      const test = document.createRange();
      test.setStart(root, 0); test.setEnd(node, nodeOffset);
      const last = fragments.filter(f => {
        const range = document.createRange(); range.selectNodeContents(f);
        return range.compareBoundaryPoints(Range.END_TO_END, test) <= 0;
      }).pop();
      if (last) return extent(last).end;
    } catch { /* Return the last documented offset. */ }
    return extent(fragments[fragments.length - 1]).end;
  }
  return null;
}

export function getEditorSelection(root) {
  if (!root) return null;
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount || !root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) return null;
  const anchor = pointToOffset(root, selection.anchorNode, selection.anchorOffset);
  const focus = pointToOffset(root, selection.focusNode, selection.focusOffset);
  return anchor === null || focus === null ? null : { anchor, focus, start: Math.min(anchor, focus), end: Math.max(anchor, focus) };
}

function pointForOffset(root, requested, fragments = fragmentsOf(root)) {
  const target = Math.max(0, requested);
  // Page fragments are already ordered by logical start position.
  let low = 0, high = fragments.length - 1, match = -1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    if (extent(fragments[mid]).start <= target) { match = mid; low = mid + 1; }
    else high = mid - 1;
  }
  if (match >= 0) {
    const fragment = fragments[match];
    const { start, end } = extent(fragment);
    const offset = Math.min(Math.max(0, target - start), end - start);
    const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT);
    let node, remainder = offset;
    while ((node = walker.nextNode())) {
      if (remainder <= node.textContent.length) return { node, offset: remainder };
      remainder -= node.textContent.length;
    }
    return { node: fragment, offset: 0 };
  }
  const first = fragments[0];
  return first ? { node: first, offset: 0 } : { node: root, offset: 0 };
}

export function restoreEditorSelection(root, anchor, focus = anchor) {
  if (!root) return;
  const fragments = fragmentsOf(root);
  const from = pointForOffset(root, anchor, fragments);
  const to = pointForOffset(root, focus, fragments);
  const selection = window.getSelection();
  if (!selection) return;
  try {
    root.focus({ preventScroll: true });
    if (typeof selection.setBaseAndExtent === 'function') selection.setBaseAndExtent(from.node, from.offset, to.node, to.offset);
    else {
      const range = document.createRange();
      range.setStart(from.node, from.offset); range.setEnd(to.node, to.offset);
      selection.removeAllRanges(); selection.addRange(range);
    }
  } catch { /* A paginating edit may have replaced DOM nodes. */ }
}

export function readEditorText(root) {
  const fragments = fragmentsOf(root);
  let result = '', previousLine = null;
  for (const fragment of fragments) {
    const line = Number(fragment.dataset.lineIndex);
    if (previousLine !== null && previousLine !== line) result += '\n';
    result += fragment.textContent || '';
    previousLine = line;
  }
  return result;
}
