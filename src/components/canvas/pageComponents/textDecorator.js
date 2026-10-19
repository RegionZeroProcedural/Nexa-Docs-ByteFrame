import React from 'react';
import { getTextRuns } from '../../../editorCore/formattingParser';
/** DOM text nodes remain the only indexed text. All formatting comes from ranges. */
export default function TextDecorator({ text, formats, start, comments = [], byteAnalysis = null }) {
  const runs = getTextRuns(text, formats, start, comments);
  if (!runs.length) return <br />;
  const indexed = byteAnalysis?.tokens || [];
  return runs.flatMap(run => {
    const style = {};
    if (run.attributes.color) style.color = run.attributes.color;
    if (run.attributes.highlight) style.backgroundColor = run.attributes.highlight;
    if (run.attributes.font) style.fontFamily = run.attributes.font;
    if (run.attributes.size) style.fontSize = `${run.attributes.size}pt`;
    const fragmentParts = [];
    let cursor = run.from;
    // Sorted analysis tokens: binary search instead of rescanning every token
    // for every formatting run in a long technical document.
    let lo = 0, hi = indexed.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (indexed[mid].end <= run.from) lo = mid + 1; else hi = mid; }
    const nearby = [];
    for (let i = lo; i < indexed.length && indexed[i].start < run.to; i++) nearby.push(indexed[i]);
    const add = (from, to, token) => {
      if (to <= from) return;
      fragmentParts.push(<span key={`${run.from}:${from}:${to}`} 
        data-byte-start={token?.start} data-byte-end={token?.end}
        data-opcode-group={token?.groupId} 
        className={`${run.marks.filter(m => ['bold', 'italic', 'underline', 'strike', 'link'].includes(m)).map(m => `mark-${m}`).join(' ')} ${run.attributes.script === 'super' ? 'mark-script-super' : run.attributes.script === 'sub' ? 'mark-script-sub' : ''} ${run.commented ? 'has-comment' : ''} ${token ? `nexa-hex-token nexa-hex-role-${token.role} nexa-hex-category-${token.category}` : ''}`}
        style={style} data-href={run.attributes.link || undefined}
        title={run.attributes.link ? `Ctrl+click to open ${run.attributes.link}` : undefined}
        onClick={e => { if ((e.ctrlKey || e.metaKey) && run.attributes.link && /^https?:\/\//i.test(run.attributes.link)) window.open(run.attributes.link, '_blank', 'noopener,noreferrer'); }}>
        {run.text.slice(from - run.from, to - run.from)}
      </span>);
    };
    for (const token of nearby) {
      const from = Math.max(token.start, run.from);
      const to = Math.min(token.end, run.to);
      if (from > cursor) add(cursor, from, null);
      if (to > cursor) { add(Math.max(from, cursor), to, token); cursor = to; }
    }
    if (cursor < run.to) add(cursor, run.to, null);
    return fragmentParts;

  });
}
