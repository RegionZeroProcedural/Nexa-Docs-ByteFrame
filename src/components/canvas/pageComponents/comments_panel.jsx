import React, { useLayoutEffect, useRef, useState } from 'react';
import { lineStarts, paragraphAt } from '../../../editorCore/paragraphs';
import { restoreEditorSelection } from '../../../editorCore/selectionManager';

/** Comments render outside the editable document. Cards follow the paragraph
 * they annotate; collision handling keeps overlapping cards readable. */
export default function CommentsPanel({ editor, showResolved = false, onClose }) {
  const railRef = useRef(null);
  const [positions, setPositions] = useState({});
  const comments = (editor.doc.comments || []).filter(c => showResolved || !c.resolved);
  const { text } = editor.doc;
  useLayoutEffect(() => {
    const refresh = () => {
      const root = editor.editorRef.current;
      const rail = railRef.current;
      if (!root || !rail) return;
      const lines = root.querySelectorAll('[data-editor-line]');
      const starts = lineStarts(text);
      const railRect = rail.getBoundingClientRect();
      const scale = Number(rail.closest('.canvas-page-row')?.dataset.zoom || 100) / 100;
      const located = comments.map(c => {
        const index = paragraphAt(text, Math.max(0, Math.min(text.length, c.start)));
        const line = lines[index];
        const y = line ? (line.getBoundingClientRect().top - railRect.top) / scale : 0;
        return { id: c.id, top: Math.max(0, y - 9) };
      }).sort((a, b) => a.top - b.top);
      let bottom = 0;
      const result = {};
      located.forEach(({ id, top }) => {
        const element = [...rail.querySelectorAll("[data-comment-id]")].find(node => node.dataset.commentId === id);
        const h = element?.offsetHeight || 125;
        result[id] = Math.max(53, top, bottom);
        bottom = result[id] + h + 12;
      });
      setPositions(result);
    };
    refresh();
    const hasFrame = typeof window.requestAnimationFrame === 'function';
    const handle = hasFrame ? window.requestAnimationFrame(refresh) : window.setTimeout(refresh, 0);
    window.addEventListener('resize', refresh);
    return () => {
      if (hasFrame) window.cancelAnimationFrame(handle);
      else window.clearTimeout(handle);
      window.removeEventListener('resize', refresh);
    };
  }, [editor.doc, editor.editorRef, text, showResolved, comments.length]);

  if (!comments.length) return null;
  return <aside ref={railRef} className="comments-rail" aria-label="Document comments">
    <div className="comments-rail-header"><strong>Comments</strong><span>{comments.filter(c => !c.resolved).length} open</span>
      {onClose && <button type="button" aria-label="Hide comments" onClick={onClose}>×</button>}</div>
    {comments.map(c => <section className={`comment-card ${c.resolved ? 'comment-resolved' : ''}`} key={c.id} data-comment-id={c.id}
      style={{ '--comment-top': `${positions[c.id] ?? 0}px` }}>
      <button type="button" className="comment-context" title="Go to annotated text"
        onClick={() => { restoreEditorSelection(editor.editorRef.current, c.start, c.end); editor.syncSelection(); }}>
        {c.resolved ? '✓ Resolved' : `“${text.slice(c.start, c.end).slice(0, 65) || 'Text removed'}”`}
      </button>
      <p>{c.text}</p>
      <div className="comment-actions">
        <button type="button" onClick={() => editor.resolveComment(c.id, !c.resolved)}>{c.resolved ? 'Reopen' : 'Resolve'}</button>
        <button type="button" onClick={() => { if (window.confirm('Delete this comment?')) editor.removeComment(c.id); }}>Delete</button>
      </div>
    </section>)}
  </aside>;
}
