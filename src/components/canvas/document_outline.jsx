import React from 'react';
import { lineStarts } from '../../editorCore/paragraphs';
export default function DocumentOutline({ editor, onClose }) {
  const lines = editor.doc.text.split('\n');
  const starts = lineStarts(editor.doc.text);
  const headings = lines.map((text, i) => ({ text, i, start: starts[i], style: editor.doc.paragraphs?.[i]?.style }))
    .filter(item => ['title', 'h1', 'h2', 'h3'].includes(item.style));
  const bookmarks = editor.doc.bookmarks || [];
  return <aside className="document-outline" aria-label="Document outline"><div className="outline-title"><strong>Outline</strong><button aria-label="Close outline" onClick={onClose}>×</button></div>
    <div className="outline-section"><small>HEADINGS</small>
      {headings.length ? headings.map(h => <button key={h.i} className={`outline-${h.style}`} onClick={() => editor.goToOffset(h.start)}>{h.text || '(Empty heading)'}</button>) : <p>Use the paragraph styles menu to create headings.</p>}
    </div>
    <div className="outline-section"><small>BOOKMARKS</small>
      {bookmarks.length ? bookmarks.map(b => <button key={b.id} onClick={() => editor.goToOffset(b.offset)}>{b.label}</button>) : <p>No bookmarks yet.</p>}
    </div>
  </aside>;
}
