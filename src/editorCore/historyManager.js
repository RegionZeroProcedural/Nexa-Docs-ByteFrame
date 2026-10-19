/** Snapshot history for the first release. The editor core can replace this
 * with a transaction log later without changing React component interfaces.
 */
export function createHistory() {
  return { past: [], future: [], lastKind: null, lastTime: 0 };
}

export function recordHistory(history, documentBefore, selectionBefore, kind = 'edit') {
  const now = Date.now();
  const coalesce = kind === 'type' && history.lastKind === 'type' && now - history.lastTime < 600 && history.past.length > 0;
  if (!coalesce) {
    history.past.push({ doc: documentBefore, selection: selectionBefore });
    if (history.past.length > 150) history.past.shift();
  }
  history.future = [];
  history.lastKind = kind;
  history.lastTime = now;
}

export function undoHistory(history, currentDoc, currentSelection) {
  if (!history.past.length) return null;
  const entry = history.past.pop();
  history.future.push({ doc: currentDoc, selection: currentSelection });
  history.lastKind = null;
  return entry;
}

export function redoHistory(history, currentDoc, currentSelection) {
  if (!history.future.length) return null;
  const entry = history.future.pop();
  history.past.push({ doc: currentDoc, selection: currentSelection });
  history.lastKind = null;
  return entry;
}
