import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Page from './page';
import EmbedMedia from './pageComponents/embed_media';
import ParagraphFragment from './paragraph_fragment';
import CommentsPanel from './pageComponents/comments_panel';
import ByteInspectorPanel from './byte_inspector_panel';
import MarginRulerLeft from './margin_ruler_left';
import MarginRulerTop from './margin_ruler_top';
import { documentLines, paginateLines, groupColumns } from './pagination';
import { rulerGeometry } from './rulerMath';
import { restoreEditorSelection } from '../../editorCore/selectionManager';
import { isEmbeddedObjectFocused } from '../../editorCore/embeddedInputScope';
import MobilePanel from '../mobile/MobilePanel';
import { mobilePageGeometry } from './mobilePageGeometry';

function sliceHeight(mirror, part, line, doc, fallbackWidth, base) {
  if (!mirror || !line) return 25;
  // The hidden mirror has already rendered rich formatting. Clone the exact
  // selected DOM range so wrapping matches the visible content, including marks.
  const clone = line.cloneNode(false);
  clone.removeAttribute('data-editor-line');
  if (part.continued) {
    clone.classList.add('paragraph-continued');
    clone.style.textIndent = '0px';
  }
  const nodeLength = part.end - part.start;
  // The full paragraph has already been laid out by the hidden measurement
  // mirror. Read its height directly instead of allocating a DOM Range, cloning
  // every formatting span, and forcing a second layout for every paragraph.
  if (!part.continued && part.start === base && nodeLength === line.textContent.length) {
    const style = getComputedStyle(line);
    const height = line.getBoundingClientRect().height + (Number.parseFloat(style.marginTop) || 0) + (Number.parseFloat(style.marginBottom) || 0);
    if (height > 0) return height;
  }
  if (nodeLength === 0) clone.append(document.createElement('br'));
  else {
    const range = document.createRange();
    const nodes = [];
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) nodes.push(node);
    const locate = index => {
      let remaining = index;
      for (const n of nodes) {
        if (remaining <= n.textContent.length) return [n, remaining];
        remaining -= n.textContent.length;
      }
      const last = nodes[nodes.length - 1];
      return last ? [last, last.textContent.length] : [line, 0];
    };
    // The fragment is measured against its original paragraph offset.
    const [a, aOffset] = locate(Math.max(0, part.start - base));
    const [b, bOffset] = locate(Math.max(0, part.end - base));
    try {
      range.setStart(a, aOffset); range.setEnd(b, bOffset);
      clone.append(range.cloneContents());
    } catch { clone.textContent = doc.text.slice(part.start, part.end); }
  }
  mirror.appendChild(clone);
  const style = getComputedStyle(clone);
  const height = clone.getBoundingClientRect().height + (Number.parseFloat(style.marginTop) || 0) + (Number.parseFloat(style.marginBottom) || 0);
  clone.remove();
  // jsdom doesn't perform layout; use a reasonable deterministic fallback there.
  return height > 0 ? height : Math.max(24, Math.ceil(nodeLength * 9 / Math.max(40, fallbackWidth)) * 24);
}

// A large document no longer builds a second full formatting DOM on EVERY
// keystroke. The measurement mirror is memoized and refreshed after a short
// idle window; the actual editable text is always updated immediately.
const PaginationMirror = React.memo(function PaginationMirror({ doc, lines, width, mirrorRef }) {
  return <div className="nexa-pagination-measure" aria-hidden="true" inert="" style={{ width: `${width}px` }}>
    <div className="page-content nexa-pagination-measure-content" ref={mirrorRef}>
      {lines.map(line => <div key={line.lineIndex} data-measure-line="">
        <ParagraphFragment doc={doc} part={{ lineIndex: line.lineIndex, start: line.start, end: line.end, continued: false }} measure />
      </div>)}
    </div>
  </div>;
});

export default function CanvasPage({ editor, zoom, view, viewport = { mobile: false, width: 1024 }, mobilePanel, onMobilePanelClose }) {
  const [verticalPreview, setVerticalPreview] = useState(null);
  const sourcePage = { ...view.page, ...(verticalPreview || {}) };
  // Viewport-only geometry; original paper size and margins remain in the document.
  const page = viewport.mobile ? mobilePageGeometry(sourcePage, viewport.width, zoom) : sourcePage;
  const g = rulerGeometry(page, editor.activeParagraph);
  const pageVariables = {
    '--paper-width': `${g.width}px`, '--paper-height': `${g.height}px`,
    '--page-margin': `${g.side}px`, '--page-margin-left': `${g.leftMargin}px`, '--page-margin-right': `${g.rightMargin}px`, '--page-margin-top': `${g.top}px`, '--page-margin-bottom': `${g.bottom}px`,
  };
  const editable = editor.editMode === 'editing';
  const lang = ({ 'English (United States)': 'en-US', 'English (United Kingdom)': 'en-GB',
    'Spanish': 'es', 'French': 'fr', 'German': 'de' })[view.language] || 'en-US';
  // Numbered lists used to scan every preceding paragraph for each rendered
  // fragment (quadratic on long documents). Compute counters just once.
  const listNumbers = useMemo(() => {
    let count = 0;
    return (editor.doc.paragraphs || []).map(paragraph => {
      if (paragraph?.list === 'number') return ++count;
      count = 0;
      return 0;
    });
  }, [editor.doc.paragraphs]);
  useLayoutEffect(() => {
    const root = editor.editorRef.current;
    if (!root) return;
    const tokenId = view.activeByte?.token?.start;
    const groupId = view.activeByte?.token?.groupId;
    root.querySelectorAll('.nexa-hex-token').forEach(el => {
      const chosen = tokenId !== undefined && Number(el.dataset.byteStart) === tokenId;
      el.classList.toggle('is-selected-byte', chosen);
      el.classList.toggle('is-selected-instruction', !chosen && !!groupId && el.dataset.opcodeGroup === groupId);
    });
  }, [view.activeByte, editor.editorRef, editor.doc.text]);

  const sourceHoveredComponent = useRef(null);
  const hoverSourceByte = event => {
    const el = event.target.closest?.('.nexa-hex-token[data-byte-start]');
    sourceHoveredComponent.current?.classList.remove('is-source-hover');
    sourceHoveredComponent.current = null;
    const token = view.activeByte?.group?.tokens?.find(part => part.start === Number(el?.dataset.byteStart));
    if (!token) return;
    const index = view.activeByte.group.tokens.indexOf(token);
    const component = document.querySelector(`.byte-inspector-rail .byte-explain-byte[data-component-byte-index="${index}"]`);
    if (component) { component.classList.add('is-source-hover'); sourceHoveredComponent.current = component; }
  };
  const hoverByte = (offset) => {
    const root = editor.editorRef.current;
    if (!root) return;
    root.querySelectorAll('.nexa-hex-token.is-explained-byte').forEach(el => el.classList.remove('is-explained-byte'));
    if (offset === null || !Number.isSafeInteger(offset)) return;
    const token = root.querySelector(`.nexa-hex-token[data-byte-start="${offset}"]`);
    token?.classList.add('is-explained-byte');
  };
  const mirrorRef = useRef(null);
  const lines = useMemo(() => documentLines(editor.doc.text), [editor.doc.text]);
  const onePage = useMemo(() => [{ fragments: lines.map(line => ({ lineIndex: line.lineIndex, start: line.start, end: line.end, continued: false })) }], [lines]);
  const hasPrintLayout = view.printLayout;
  const [deferredDoc, setDeferredDoc] = useState(editor.doc);
  const isLargeDocument = editor.doc.text.length > 12000;
  useEffect(() => {
    if (!hasPrintLayout) return undefined;
    const timer = setTimeout(() => setDeferredDoc(editor.doc), isLargeDocument ? 170 : 0);
    return () => clearTimeout(timer);
  }, [editor.doc, isLargeDocument, hasPrintLayout]);
  const measuredDoc = isLargeDocument ? deferredDoc : editor.doc;
  const measuredLines = useMemo(() => documentLines(measuredDoc.text), [measuredDoc.text]);
  const columnCount = hasPrintLayout ? (viewport.mobile ? 1 : Math.min(3, Math.max(1, Number(view.page?.columns) || 1))) : 1;
  const innerWidth = g.width - g.leftMargin - g.rightMargin;
  const width = (innerWidth - (columnCount - 1) * 20) / columnCount;
  const geometryKey = [g.width,g.height,g.leftMargin,g.rightMargin,g.top,g.bottom,columnCount].join(':');
  const [layout, setLayout] = useState(null);
  useLayoutEffect(() => {
    if (!hasPrintLayout) return;
    const mirror = mirrorRef.current;
    if (!mirror) return;
    const targets = [...mirror.querySelectorAll('[data-measure-line] > .document-line')];
    const measureLine = (part) => sliceHeight(mirror, part, targets[part.lineIndex], measuredDoc, width, measuredLines[part.lineIndex].start);
    const breakBefore = index => !!measuredDoc.paragraphs?.[index]?.pageBreakBefore;
    const flow = paginateLines(measuredDoc.text, g.height - g.top - g.bottom - 12, measureLine, 2000, { breakBefore });
    setLayout({ doc: measuredDoc, geometryKey, pages: groupColumns(flow, columnCount) });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measuredDoc, geometryKey, hasPrintLayout]);
  // Stale page offsets must never slice a newer document: during the brief
  // repagination interval, render the latest content in a single safe flow.
  const awaitingLayout = hasPrintLayout && (layout?.doc !== editor.doc || layout?.geometryKey !== geometryKey);
  const textPages = hasPrintLayout && !awaitingLayout ? layout.pages : onePage.map(p => ({ columns: [p] }));
  // Independent, floating page objects keep a logical caret offset as their
  // insertion anchor. Their coordinates do not create fake document paragraphs.
  const pages = useMemo(() => {
    const base = hasPrintLayout ? textPages : [{ columns: [onePage[0]] }];
    const pagesWithObjects = base.map(section => ({ ...section, embeds: [] }));
    const bounds = pagesWithObjects.map(section => {
      const fragments = section.columns.flatMap(column => column.fragments || []);
      return { start: fragments[0]?.start ?? 0, end: fragments[fragments.length - 1]?.end ?? 0 };
    });
    for (const item of editor.doc.embeds || []) {
      const anchored = bounds.findIndex((range, i) => item.offset >= range.start &&
        (item.offset < range.end || (i === bounds.length - 1 && item.offset <= range.end)));
      const index = Number.isInteger(item.pageIndex)
        ? Math.max(0, Math.min(pagesWithObjects.length - 1, item.pageIndex))
        : Math.max(0, anchored);
      pagesWithObjects[index].embeds.push(item);
    }
    return pagesWithObjects;
  }, [textPages, hasPrintLayout, onePage, editor.doc.embeds]);

  // React moves paragraph fragments between pages after measurement; preserve
  // the user's logical cursor instead of leaving it on a discarded DOM node.
  const lastPagesRef = useRef(pages);
  useLayoutEffect(() => {
    if (lastPagesRef.current !== pages && editor.editorRef.current && !isEmbeddedObjectFocused()) {
      const sel = editor.selection;
      restoreEditorSelection(editor.editorRef.current, sel.anchor, sel.focus);
    }
    lastPagesRef.current = pages;
  }, [pages, editor.editorRef, editor.selection]);
  const horizontalChange = (kind, value) => {
    if (!editable) return;
    if (kind === 'marginLeft' || kind === 'marginRight') editor.updatePage({ [kind === 'marginLeft' ? 'leftMargin' : 'rightMargin']: value });
    else editor.changeParagraph(kind, value);
  };
  const verticalChange = (kind, value) => {
    if (editable) editor.updatePage({ [kind === 'top' ? 'topMargin' : 'bottomMargin']: value });
  };
  return <div className={`canvas-page-row ${viewport.mobile ? 'is-mobile-document' : ''} ${hasPrintLayout ? 'nexa-print-pages' : 'nexa-pageless'} ${awaitingLayout ? 'nexa-pagination-pending' : ''}`}
    data-zoom={zoom} style={{ zoom: `${zoom}%`, ...pageVariables }}>
    <section className="paper-wrap" style={pageVariables} aria-label="Document pages">
      {/* One editable surface spans the entire logical document, even across sheets. */}
      <div className="nexa-edit-surface" ref={editor.editorRef} contentEditable={editable}
        suppressContentEditableWarning spellCheck={editor.spellcheck} lang={lang} role="textbox" aria-multiline="true"
        aria-readonly={!editable} aria-label="Document content"
        data-is-empty={editor.doc.text.length === 0 ? 'true' : undefined} {...editor.editorEvents}
        onMouseOver={hoverSourceByte} onMouseLeave={() => { sourceHoveredComponent.current?.classList.remove('is-source-hover'); sourceHoveredComponent.current=null; }}>
        {pages.map((section, index) => <React.Fragment key={index}>
          {index === 0 && view.showRuler && <div contentEditable={false}><MarginRulerTop page={page} paragraph={editor.activeParagraph} onChange={horizontalChange} disabled={!editable || viewport.mobile} /></div>}
          <div className="paper-page-frame" data-page-number={index + 1}>
            {view.showRuler && <div contentEditable={false}><MarginRulerLeft page={page} onChange={verticalChange} disabled={!editable}
              onPreview={(kind, value) => setVerticalPreview(kind ? { [kind === 'top' ? 'topMargin' : 'bottomMargin']: value } : null)} /></div>}
            <div className="paper-page" aria-label={`Page ${index + 1}`}>
              <div className="paper-margin-outline" aria-hidden="true" contentEditable={false} />
              {!!view.page?.headerText && <div className="nexa-running-header" contentEditable={false}>{view.page.headerText}</div>}
              <Page doc={editor.doc} columns={section.columns} columnCount={hasPrintLayout ? columnCount : 1} listNumbers={listNumbers} onChecklist={editor.toggleChecklist}
                editMode={editor.editMode} byteAnalysis={view.byteAnalysis} />
              <EmbedMedia items={section.embeds} pageIndex={index} pageWidth={g.width} pageHeight={g.height}
                marginLeft={g.leftMargin} marginRight={g.rightMargin} marginTop={g.top} marginBottom={g.bottom} readOnly={!editable}
                onUpdate={editor.updateEmbed}
                onMove={(id, changes) => editor.updateEmbed(id, changes)}
                onRemove={editor.removeImage} onEdit={item => {
                  if (item.type === 'table') {
                    const entered = window.prompt('Edit table: rows separated by newlines, cells by tabs', item.rows?.map(row => row.join('\t')).join('\n') || '');
                    if (entered !== null) editor.updateEmbed(item.id, { rows: entered.split('\n').slice(0, 30).map(row => row.split('\t').slice(0, 12).map(cell => cell.slice(0, 600))) });
                  } else if (item.type === 'chart') {
                    const entered = window.prompt('Edit chart: label,value per line', item.points?.map(pt => `${pt.label},${pt.value}`).join('\n') || '');
                    if (entered !== null) {
                      const points = entered.split('\n').slice(0, 30).map(line => { const at = line.lastIndexOf(','); return { label: line.slice(0, at).trim(), value: Number(line.slice(at + 1)) }; }).filter(pt => pt.label && Number.isFinite(pt.value));
                      if (points.length) editor.updateEmbed(item.id, { points });
                    }
                  } else if (item.type === 'image') {
                    const entered = window.prompt('Image width (% of writing area, 20–100)', String(item.width || 100));
                    if (entered !== null && Number.isFinite(Number(entered))) editor.updateEmbed(item.id, { width: Math.min(100, Math.max(20, Number(entered))) });
                  }
                }} />
              {(!!view.page?.footerText || !!view.page?.showPageNumbers) && <div className="nexa-running-footer" contentEditable={false}>
                <span>{view.page.footerText || ''}</span><span>{view.page.showPageNumbers ? `${index + 1} / ${pages.length}` : ''}</span>
              </div>}
            </div>
          </div>
          <div className="page-number-label" contentEditable={false}>{String(index + 1).padStart(2, '0')} <span>—</span> NEXA DOCS</div>
        </React.Fragment>)}
      </div>
      <PaginationMirror doc={measuredDoc} lines={measuredLines} width={width} mirrorRef={mirrorRef} />
    </section>
    {view.showByteFrame && (viewport.mobile ?
      <MobilePanel open={mobilePanel === 'byteframe'} title="ByteFrame inspector" side="right" onClose={onMobilePanelClose}>
        <ByteInspectorPanel analysis={view.activeByte} structure={view.byteAnalysis?.structure} groups={view.byteAnalysis?.groups || []} truncated={view.byteAnalysis?.truncated} analyzing={view.byteAnalysisPending} onSelect={offset => { editor.goToOffset(offset); onMobilePanelClose(); }} onHover={hoverByte} />
      </MobilePanel> :
      <ByteInspectorPanel analysis={view.activeByte} structure={view.byteAnalysis?.structure} groups={view.byteAnalysis?.groups || []} truncated={view.byteAnalysis?.truncated} analyzing={view.byteAnalysisPending} onSelect={editor.goToOffset} onHover={hoverByte} />)}
    {view.showComments && (viewport.mobile ?
      <MobilePanel open={mobilePanel === 'comments'} title="Document comments" side="right" onClose={onMobilePanelClose}>
        {editor.doc.comments?.some(c => view.showResolved || !c.resolved)
          ? <CommentsPanel editor={editor} showResolved={view.showResolved} onClose={onMobilePanelClose} />
          : <p className="mobile-panel-empty">No comments in this document yet.</p>}
      </MobilePanel> : editor.doc.comments?.some(c => view.showResolved || !c.resolved) &&
        <CommentsPanel editor={editor} showResolved={view.showResolved} onClose={() => view.setShowComments(false)} />)}
  </div>;
}
