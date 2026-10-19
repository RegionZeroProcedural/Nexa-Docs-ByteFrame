import React from 'react';
import TextDecorator from './pageComponents/textDecorator';
import { DEFAULT_PARAGRAPH } from '../../editorCore/paragraphs';

/** One visual fragment of a *logical* paragraph. Slices preserve absolute UTF-16 offsets. */
function ParagraphFragment({ doc, part, onChecklist, measure = false, byteAnalysis = null }) {
  const p = { ...DEFAULT_PARAGRAPH, ...(doc.paragraphs?.[part.lineIndex] || {}) };
  const continued = !!part.continued;
  const list = p.list !== 'none' && !continued;
  return <div
    className={`document-line paragraph-${p.style || 'normal'} ${list ? `paragraph-list-${p.list}` : ''} ${continued ? 'paragraph-continued' : ''} ${p.borderBottom ? 'paragraph-border-bottom' : ''}`}
    {...(!measure ? {
      'data-editor-fragment': '', 'data-fragment-start': part.start,
      'data-fragment-end': part.end, 'data-line-index': part.lineIndex,
      ...(continued ? {} : { 'data-editor-line': '', 'data-line-number': part.lineIndex + 1 }),
    } : {})}
    data-checked={p.checked ? 'true' : undefined}
    data-marker={list ? part.marker : undefined}
    style={{ textAlign: p.align, lineHeight: p.spacing,
      '--paragraph-indent': `${Math.min(8, p.indent || 0) * 27}px`,
      paddingLeft: `${Math.min(8, p.indent || 0) * 27}px`,
      paddingRight: `${Math.max(0, p.rightIndent || 0)}px`,
      marginTop: continued ? 0 : `${Math.max(0,Number(p.spaceBefore) || 0)}px`, marginBottom: continued ? 0 : `${Math.max(0,Number(p.spaceAfter) || 0)}px`, textIndent: continued ? '0px' : `${p.firstLineIndent || 0}px` }}>
    {list && p.list === 'checklist' && !measure &&
      <button type="button" className={`checklist-toggle ${p.checked ? 'is-checked' : ''}`}
        contentEditable={false} tabIndex={-1} aria-label={p.checked ? 'Uncheck item' : 'Check item'}
        onMouseDown={e => e.preventDefault()} onClick={() => onChecklist(part.lineIndex)} />}
    <TextDecorator text={doc.text.slice(part.start, part.end)} formats={doc.formats}
      start={part.start} comments={measure ? [] : doc.comments} byteAnalysis={byteAnalysis} />
  </div>;
}

// Preserve unchanged paragraphs during typing. A document object's identity
// changes on every edit, but a fragment with the same offsets/content,
// formatting array, and paragraph properties needs no new DOM nodes.
function equalFragment(a, b) {
  if (a.measure !== b.measure || a.part.lineIndex !== b.part.lineIndex ||
      a.part.start !== b.part.start || a.part.end !== b.part.end ||
      a.part.continued !== b.part.continued || a.part.marker !== b.part.marker ||
      a.byteAnalysis !== b.byteAnalysis || a.doc.formats !== b.doc.formats ||
      a.doc.comments !== b.doc.comments || a.doc.paragraphs?.[a.part.lineIndex] !== b.doc.paragraphs?.[b.part.lineIndex]) return false;
  if (a.doc.paragraphs?.[a.part.lineIndex]?.list === 'checklist' && a.onChecklist !== b.onChecklist) return false;
  if (a.doc.text === b.doc.text) return true;
  return a.doc.text.slice(a.part.start, a.part.end) === b.doc.text.slice(b.part.start, b.part.end);
}
export default React.memo(ParagraphFragment, equalFragment);
