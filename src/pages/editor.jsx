import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Header from '../components/header/header';
import Toolbar from '../components/toolbar/toolbar';
import CanvasContainer from '../components/canvas/canvas_container';
import BinaryFileView from '../components/canvas/binary_file_view';
import Cursor from '../components/canvas/pageComponents/cursor';
import HelpTooltip from '../components/feedback/HelpTooltip';
import EditorDialog from '../components/dialogs/EditorDialog';
import useDocumentEditor from '../hooks/useDocumentEditor';
import buildMenus from '../menus/buildMenus';
import { restoreEditorSelection } from '../editorCore/selectionManager';
import { isEmbeddedObjectFocused } from '../editorCore/embeddedInputScope';
import { selectedByteAnalysis } from '../byteframe/core/byteAnalysis';
import useByteAnalysis, { BYTE_ANALYSIS_IMMEDIATE_LIMIT } from '../hooks/useByteAnalysis';

export default function Editor() {
  const editor = useDocumentEditor();
  const [binaryFile, setBinaryFile] = useState(null);
  const previousEditModeRef = useRef('editing');
  const [byteFrameOverride, setByteFrameOverride] = useState(null);
  const showByteFrame = byteFrameOverride ?? !!binaryFile;
  const setShowByteFrame = useCallback(value => setByteFrameOverride(value), []);
  // ByteFrame operates independently of the document extension.
  const colorizeBytes = showByteFrame;
  const byteAnalysis = useByteAnalysis(editor.doc.text, colorizeBytes && !binaryFile);
  const activeByte = useMemo(() => selectedByteAnalysis(byteAnalysis, editor.selection), [byteAnalysis, editor.selection]);
  const [zoom, setZoom] = useState(100);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [showComments, setShowComments] = useState(true);
  const [showResolved, setShowResolved] = useState(false);
  const [showRuler, setShowRuler] = useState(true);
  const [printLayout, setPrintLayout] = useState(true);
  const [showNonPrinting, setShowNonPrinting] = useState(false);
  const [showLineNumbers, setShowLineNumbers] = useState(false);
  const [showEquation, setShowEquation] = useState(false);
  const [showOutline, setShowOutline] = useState(false);
  const [language, setLanguage] = useState('English (United States)');
  const [saveNotice, setSaveNotice] = useState('');
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => localStorage.getItem('nexa-docs:notify-save') === 'true');
  useEffect(() => {
    const listener = () => setNotificationsEnabled(localStorage.getItem('nexa-docs:notify-save') === 'true');
    window.addEventListener('nexa-notification-setting', listener);
    return () => window.removeEventListener('nexa-notification-setting', listener);
  }, []);
  useEffect(() => {
    if (!notificationsEnabled || editor.saveStatus !== 'Saved locally') return;
    setSaveNotice('Document saved in this browser');
    const timer = setTimeout(() => setSaveNotice(''), 2500);
    return () => clearTimeout(timer);
  }, [editor.savedRevision, editor.saveStatus, notificationsEnabled]);
  const [legalHash, setLegalHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onHashChange = () => setLegalHash(window.location.hash);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  const fileRef = useRef(null);
  const imageRef = useRef(null);
  const binaryDownloadRef = useRef(null);
  const view = useMemo(() => ({
    dialog, setDialog, showComments, setShowComments, showResolved, setShowResolved,
    showRuler, setShowRuler, printLayout, setPrintLayout, showNonPrinting, setShowNonPrinting,
    showLineNumbers, setShowLineNumbers, showEquation, setShowEquation, showOutline, setShowOutline,
    language, setLanguage, byteAnalysis, activeByte, byteAnalysisPending: colorizeBytes && !binaryFile && editor.doc.text.length > BYTE_ANALYSIS_IMMEDIATE_LIMIT && !byteAnalysis, showByteFrame, setShowByteFrame, binaryFile: !!binaryFile, page: editor.doc.pageSettings || { width: 816, height: 1056, margin: 100 },
  }), [dialog, showComments, showResolved, showRuler, printLayout, showNonPrinting, showLineNumbers, showEquation, showOutline, language, editor.doc.pageSettings, byteAnalysis, activeByte, colorizeBytes, editor.doc.text.length, showByteFrame, setShowByteFrame, binaryFile]);
  const refs = { fileRef, imageRef, openFile: () => openViaPicker(),
    downloadOriginalExtension: () => binaryDownloadRef.current?.() };
  const groups = buildMenus(editor, view, refs);
  const closeDialog = useCallback(() => {
    setDialog(null);
    if (['#privacy', '#terms'].includes(window.location.hash)) window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, []);
  useLayoutEffect(() => {
    const pending = editor.restoreRef.current;
    if (pending && editor.editorRef.current && !isEmbeddedObjectFocused()) {
      restoreEditorSelection(editor.editorRef.current, pending.anchor, pending.focus);
      editor.restoreRef.current = null;
    }
  }, [editor.doc, editor.editorRef, editor.restoreRef]);
  const onOpenFile = async file => {
    const name = file.name.toLowerCase();
    const openBinary = () => {
      if (!binaryFile) previousEditModeRef.current = editor.editMode;
      setBinaryFile(file);
      editor.setEditMode('viewing');
      setByteFrameOverride(null);
    };
    if (name.endsWith('.nexa.json')) {
      await editor.importBackup(file); setBinaryFile(null); setByteFrameOverride(null); editor.setEditMode('editing'); return;
    }
    const textExt = /\.(txt|md|csv|log|json|js|jsx|ts|tsx|py|rs|c|h|cpp|css|html|xml|yaml|yml|sh|java|ini|toml)$/i.test(file.name);
    if (textExt) {
      const probe = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
      const sample = new TextDecoder('utf-8', { fatal: false }).decode(probe);
      const looksBinary = probe.includes(0) || (sample.match(/\uFFFD/g) || []).length > 2;
      if (!looksBinary) {
        await editor.importText(file); setBinaryFile(null); setByteFrameOverride(null); editor.setEditMode('editing'); return;
      }
    }
    openBinary();
  };
  const openViaPicker = async () => {
    if (typeof window.showOpenFilePicker !== 'function') { fileRef.current?.click(); return; }
    try {
      // Retaining this handle makes a native .nxtf file genuinely writable;
      // the legacy hidden file input exposes bytes but grants no write access.
      const [handle] = await window.showOpenFilePicker({ multiple: false });
      if (!handle) return;
      const file = await handle.getFile();
      if (!window.confirm('Open this file? Editable documents replace the current draft. Binary files open in ByteFrame for byte inspection and reversible edits without replacing the draft.')) return;
      await onOpenFile(file);
    } catch (error) { if (error.name !== 'AbortError') window.alert(error.message || 'Unable to open file.'); }
  };
  useEffect(() => {
    const onShortcut = event => {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod || event.altKey) return;
      const target = event.target;
      // Nested table/chart inputs are inside .nexa-edit-surface, but they
      // must retain native text-editing shortcuts rather than opening dialogs.
      const outsideEditorInput = target && (target.matches?.('input,textarea,select') ||
        (target.isContentEditable && !target.closest?.('.nexa-edit-surface')));
      if (outsideEditorInput) return;
      const key = event.key.toLowerCase();
      if (key === 'h' || (key === 'f' && !event.shiftKey)) { event.preventDefault(); setDialog('find'); }
      else if (key === 'o') { event.preventDefault(); openViaPicker(); }
      else if (key === '/' && !event.shiftKey) { event.preventDefault(); setDialog('shortcuts'); }
      else if (key === 'c' && event.shiftKey) { event.preventDefault(); setDialog('wordcount'); }
      else if (key === 'p' && event.shiftKey) { event.preventDefault(); setShowNonPrinting(value => !value); }
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, [openViaPicker]);
  const closeBinary = () => {
    setBinaryFile(null); setByteFrameOverride(null);
    editor.setEditMode(previousEditModeRef.current);
  };
  const binaryName = binaryFile?.name || '';
  const binaryExt = binaryName.match(/\.([^.]+)$/)?.[1] || 'bin';
  const headerDoc = binaryFile ? { ...editor.doc, title: binaryName.replace(/\.[^.]+$/, '').slice(0, 120),
    extension: `.${binaryExt.toLowerCase()}` } : editor.doc;
  return <div className={`nexa-shell ${showLineNumbers ? 'nexa-show-lines' : ''} ${showNonPrinting ? 'nexa-show-formatting-marks' : ''}`}>
    <HelpTooltip />
    {!!saveNotice && <div className="nexa-save-toast" role="status">✓ {saveNotice}</div>}
    <div id="nexa-document-header" hidden={headerCollapsed}>
      <Header doc={headerDoc} saveStatus={binaryFile ? 'Byte edits staged · draft unchanged' : editor.saveStatus}
        readOnlyPreview={!!binaryFile} onTitleChange={editor.updateTitle}
        onFavorite={editor.toggleFavorite} onExtensionChange={editor.updateExtension} groups={groups} fileRef={fileRef} onOpenFile={onOpenFile} />
    </div>
    <Toolbar editor={editor} zoom={zoom} setZoom={setZoom} headerCollapsed={headerCollapsed}
      toggleHeader={() => setHeaderCollapsed(value => !value)} onPrint={() => window.print()}
      onAddComment={() => { editor.addComment(); setShowComments(true); }} />
    {showEquation && <div className="equation-palette" aria-label="Equation toolbar">
      <span>Equation symbols</span>{['π', '∑', '∫', '√', '∞', '±', '≤', '≥', '≠', '×'].map(v => <button key={v} title={`Insert ${v}`} onMouseDown={e => e.preventDefault()} onClick={() => editor.insertAtSelection(v)}>{v}</button>)}
      <button aria-label="Close equation toolbar" onClick={() => setShowEquation(false)}>×</button>
    </div>}
    {editor.legacyDraftBlocked && <div role="alert" className="legacy-recovery-alert">
      An older NXTF browser draft is stored here. Nexa Docs no longer edits that format. Open your old Patch 20 build to export a backup before continuing.
      <button type="button" onClick={editor.discardLegacyNxtfPointer}>I have a backup — start a new document</button>
    </div>}
    {binaryFile ? <BinaryFileView file={binaryFile} showByteFrame={showByteFrame}
      onToggleByteFrame={() => setByteFrameOverride(!showByteFrame)}
      onRegisterDownload={fn => { binaryDownloadRef.current = fn; }}
      onClose={closeBinary} />
      : !editor.legacyDraftBlocked && <CanvasContainer editor={editor} zoom={zoom} view={view} />} 
    <input ref={imageRef} hidden type="file" accept="image/*" onChange={event => { editor.insertImage(event.target.files?.[0]); event.target.value = ''; }} />
    <footer className="editor-statusbar">
      <span><span className="status-indicator" /> {editor.editMode === 'editing' ? 'Editing locally' : 'Viewing'} <span className="status-separator">/</span> Nexa Docs Preview</span>
      <span className="status-right"><Cursor text={editor.doc.text} selection={editor.selection} />
        <span className="status-separator">·</span>{editor.wordCount.toLocaleString()} words
        <span className="status-separator">·</span>{editor.doc.text.length.toLocaleString()} characters
        <span className="status-separator">·</span>{printLayout ? 'Pages' : 'Pageless'}
      </span>
    </footer>
    <nav className="nexa-legal-links" aria-label="Legal notices">
      <a href="#privacy" onClick={() => setLegalHash('#privacy')}>Privacy</a><span aria-hidden="true">·</span>
      <a href="#terms" onClick={() => setLegalHash('#terms')}>Terms</a>
    </nav>
    {(dialog || legalHash === '#privacy' || legalHash === '#terms') && <EditorDialog mode={dialog || legalHash.slice(1)} editor={editor} view={view} onClose={closeDialog} />}
  </div>;
}
