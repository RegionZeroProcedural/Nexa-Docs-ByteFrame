import { useCallback, useEffect, useRef, useState } from 'react';
import { loadDraft, makeBlankDocument, validateDocument, STORAGE_KEY } from '../editorCore/documentModel';
import { locateEmbedAtCaret } from '../editorCore/embedPosition';
import { isEmbeddedObjectEvent, isEmbeddedObjectFocused } from '../editorCore/embeddedInputScope';
import useResponsiveWordCount from './useResponsiveWordCount';
import { TOGGLE_TYPES, isRangeFormatted, formatsAtCaret, setRangeAttribute, toggleRange, clearRangeFormatting, valueAtPosition } from '../editorCore/editRanges';
import { transformRangesForReplace, transformAnnotationRanges } from '../editorCore/rangeTransforms';
import { paragraphsForText, paragraphAt, setParagraphProperty, transformParagraphs, selectedParagraphIndexes, DEFAULT_PARAGRAPH } from '../editorCore/paragraphs';
import { createHistory, recordHistory, redoHistory, undoHistory } from '../editorCore/historyManager';
import { getEditorSelection, readEditorText, restoreEditorSelection } from '../editorCore/selectionManager';
import { documentToHTML, saveBlob } from '../editorCore/exportDocument';
import { normalizeExtension } from '../editorCore/fileExtension';
import { fragmentFromDocument, normalizeFragment, fragmentToHTML, fragmentFromHTML, fragmentFromClipboardData, NEXA_CLIPBOARD_TYPE } from '../editorCore/richClipboard';

const normalizeText = value => value.replace(/\r\n?/g, '\n');
const initialSelection = { start: 0, end: 0, anchor: 0, focus: 0 };
const makeSelection = (anchor, focus = anchor) => ({ anchor, focus, start: Math.min(anchor, focus), end: Math.max(anchor, focus) });
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const AUTOSAVE_IDLE_MS = 1000; // Debounced local draft autosave.

export default function useDocumentEditor() {
  const [doc, setDoc] = useState(loadDraft);
  const [legacyDraftBlocked, setLegacyDraftBlocked] = useState(() => !!doc.__legacyStoragePointer);
  const docRef = useRef(doc);
  const editorRef = useRef(null);
  const selectionRef = useRef(initialSelection);
  const [selection, setSelection] = useState(initialSelection);
  const restoreRef = useRef(null);
  const composingRef = useRef(false);
  const plainPasteRef = useRef(false);
  const copiedFragmentRef = useRef(null);
  const historyRef = useRef(createHistory());
  const [historyAvailability, setHistoryAvailability] = useState({ undo: false, redo: false });
  const pendingFormatsRef = useRef(null);
  const [pendingFormats, setPendingFormats] = useState(null);
  const brushRef = useRef(null);
  const [paintActive, setPaintActive] = useState(false);
  const [spellcheck, setSpellcheck] = useState(true);
  const [editMode, setEditMode] = useState(() => doc.__legacyStoragePointer ? 'viewing' : 'editing');
  const [saveStatus, setSaveStatus] = useState('Saved locally');
  const [savedRevision, setSavedRevision] = useState(() => doc.updatedAt);
  const rememberSelection = useCallback(next => {
    if (!next) return;
    const prev = selectionRef.current;
    if (prev.anchor !== next.anchor || prev.focus !== next.focus) {
      selectionRef.current = next;
      pendingFormatsRef.current = null;
      setPendingFormats(null);
      setSelection(next);
    }
  }, []);
  const syncSelection = useCallback(() => {
    if (isEmbeddedObjectFocused()) return;
    if (editorRef.current && !composingRef.current) rememberSelection(getEditorSelection(editorRef.current));
  }, [rememberSelection]);
  useEffect(() => {
    document.addEventListener('selectionchange', syncSelection);
    return () => document.removeEventListener('selectionchange', syncSelection);
  }, [syncSelection]);

  const refreshHistory = () => setHistoryAvailability({ undo: historyRef.current.past.length > 0, redo: historyRef.current.future.length > 0 });
  const commit = (next, kind, nextSelection = selectionRef.current) => {
    recordHistory(historyRef.current, docRef.current, selectionRef.current, kind);
    const updated = { ...next, updatedAt: Math.max(Date.now(), (docRef.current.updatedAt || 0) + 1) };
    // Editing computes a complete coverage-preserving chunk map itself. Don't
    // re-validate every chunk a second time for each individual keystroke.
    docRef.current = updated;
    restoreRef.current = nextSelection;
    const normalized = makeSelection(nextSelection.anchor, nextSelection.focus);
    selectionRef.current = normalized;
    setSelection(normalized);
    setDoc(docRef.current);
    refreshHistory();
  };

  const replaceText = (from, to, replacement, kind = 'edit', insertedFragment = null) => {
    if (editMode !== 'editing') return;
    const current = docRef.current;
    const text = normalizeText(replacement);
    const start = Math.max(0, Math.min(current.text.length, from));
    const end = Math.max(start, Math.min(current.text.length, to));
    if (start === end && !text.length) return;
    const inherited = insertedFragment ? [] : (pendingFormatsRef.current !== null ? pendingFormatsRef.current
      : formatsAtCaret(current.formats, start < end ? start + 1 : start));
    const newText = current.text.slice(0, start) + text + current.text.slice(end);
    let formats = transformRangesForReplace(current.formats, start, end, text.length, inherited);
    let paragraphs = transformParagraphs(current.text, newText, current.paragraphs, start, end, text.length);
    if (insertedFragment) {
      // Existing marks may straddle the insertion. Rich paste replaces the inserted
      // region's styles rather than inheriting marks from the surrounding text.
      formats = clearRangeFormatting(formats, start, start + text.length);
      for (const format of insertedFragment.formats) {
        if (format.end > format.start) formats = setRangeAttribute(formats,
          start + format.start, start + format.end, format.type, format.value ?? true);
      }
      // Preserve paragraph-level styles for blocks being pasted at a line boundary.
      if ((start === 0 || current.text[start - 1] === '\n') && insertedFragment.paragraphs?.length) {
        const first = current.text.slice(0, start).split('\n').length - 1;
        paragraphs = [...paragraphs];
        insertedFragment.paragraphs.forEach((p, index) => {
          if (paragraphs[first + index]) paragraphs[first + index] = {
            ...paragraphs[first + index], ...Object.fromEntries(Object.entries(p).filter(([k]) =>
              ['style', 'align', 'spacing', 'indent', 'list', 'checked'].includes(k))),
          };
        });
      }
    }
    commit({ ...current, text: newText,
      formats,
      paragraphs,
      comments: transformAnnotationRanges(current.comments, start, end, text.length),
      suggestions: transformAnnotationRanges(current.suggestions || [], start, end, text.length),
      embeds: current.embeds?.length ? current.embeds.map(item => ({ ...item, offset: item.offset >= end ? item.offset + text.length - (end - start) : item.offset > start ? start + text.length : item.offset })) : current.embeds,
      bookmarks: current.bookmarks?.length ? current.bookmarks.map(item => ({ ...item, offset: item.offset >= end ? item.offset + text.length - (end - start) : item.offset > start ? start + text.length : item.offset })) : current.bookmarks,
    }, kind, makeSelection(start + text.length));
  };

  const setPending = formats => {
    pendingFormatsRef.current = formats;
    setPendingFormats(formats);
    editorRef.current?.focus({ preventScroll: true });
  };
  const toggleFormat = type => {
    if (editMode !== 'editing' || !TOGGLE_TYPES.includes(type)) return;
    const current = docRef.current;
    const { start, end } = selectionRef.current;
    if (start === end) {
      const active = pendingFormatsRef.current ?? formatsAtCaret(current.formats, start);
      setPending(active.some(f => f.type === type) ? active.filter(f => f.type !== type) : [...active, { type }]);
      return;
    }
    commit({ ...current, formats: toggleRange(current.formats, start, end, type) }, 'format', selectionRef.current);
  };
  const setTextAttribute = (type, value) => {
    if (editMode !== 'editing') return;
    const { start, end } = selectionRef.current;
    if (start === end) {
      const active = pendingFormatsRef.current ?? formatsAtCaret(docRef.current.formats, start);
      setPending([...active.filter(f => f.type !== type), ...(value === null ? [] : [{ type, value }])]);
    } else {
      commit({ ...docRef.current, formats: setRangeAttribute(docRef.current.formats, start, end, type, value) }, 'format', selectionRef.current);
    }
  };
  const changeParagraph = (key, value) => {
    if (editMode !== 'editing') return;
    const current = docRef.current;
    const { start, end } = selectionRef.current;
    let paragraphs = setParagraphProperty(current.text, current.paragraphs, start, end, key, value);
    if (key === 'list') paragraphs = paragraphs.map((p, i) => selectedParagraphIndexes(current.text, start, end).includes(i) ? { ...p, checked: false } : p);
    commit({ ...current, paragraphs }, 'paragraph', selectionRef.current);
  };
  const changeIndent = delta => {
    if (editMode !== 'editing') return;
    const current = docRef.current;
    const { start, end } = selectionRef.current;
    const paragraphs = paragraphsForText(current.text, current.paragraphs);
    selectedParagraphIndexes(current.text, start, end).forEach(i => { paragraphs[i] = { ...paragraphs[i], indent: Math.min(8, Math.max(0, (paragraphs[i].indent || 0) + delta)) }; });
    commit({ ...current, paragraphs }, 'paragraph', selectionRef.current);
  };
  const toggleChecklist = index => {
    if (editMode !== 'editing') return;
    const current = docRef.current;
    const paragraphs = paragraphsForText(current.text, current.paragraphs);
    if (!paragraphs[index] || paragraphs[index].list !== 'checklist') return;
    paragraphs[index] = { ...paragraphs[index], checked: !paragraphs[index].checked };
    commit({ ...current, paragraphs }, 'paragraph', selectionRef.current);
  };
  const clearFormatting = () => {
    if (editMode !== 'editing') return;
    const current = docRef.current;
    const { start, end } = selectionRef.current;
    if (start === end) { setPending([]); return; }
    const paragraphs = paragraphsForText(current.text, current.paragraphs);
    selectedParagraphIndexes(current.text, start, end).forEach(i => { paragraphs[i] = { ...DEFAULT_PARAGRAPH }; });
    commit({ ...current, formats: clearRangeFormatting(current.formats, start, end), paragraphs }, 'format', selectionRef.current);
  };

  const togglePaint = () => {
    if (paintActive) { brushRef.current = null; setPaintActive(false); return; }
    const { start } = selectionRef.current;
    const current = docRef.current;
    brushRef.current = { formats: formatsAtCaret(current.formats, start + (selectionRef.current.end > start ? 1 : 0)), source: [selectionRef.current.start, selectionRef.current.end] };
    setPaintActive(true);
  };
  const tryPaint = () => {
    const brush = brushRef.current;
    const { start, end } = selectionRef.current;
    if (!brush || start === end || (start === brush.source[0] && end === brush.source[1])) return;
    const current = docRef.current;
    let formats = clearRangeFormatting(current.formats, start, end);
    for (const f of brush.formats) formats = setRangeAttribute(formats, start, end, f.type, f.value ?? true);
    brushRef.current = null; setPaintActive(false);
    commit({ ...current, formats }, 'format', selectionRef.current);
  };

  const addLink = () => {
    if (editMode !== 'editing') return;
    const s = selectionRef.current;
    if (s.start === s.end) { window.alert('Select the text you want to turn into a link.'); return; }
    const existing = valueAtPosition(docRef.current.formats, s.start, 'link', '');
    const url = window.prompt('Link URL (leave blank to remove a link):', existing || 'https://');
    if (url === null) return;
    const trimmed = url.trim();
    if (trimmed && !/^https?:\/\//i.test(trimmed) && !/^mailto:/i.test(trimmed)) { window.alert('Use an https://, http:// or mailto: URL.'); return; }
    setTextAttribute('link', trimmed || null);
  };
  const addComment = () => {
    if (editMode !== 'editing') return;
    const { start, end } = selectionRef.current;
    if (start === end) { window.alert('Select text to attach a comment.'); return; }
    const text = window.prompt('Comment on selected text:');
    if (!text?.trim()) return;
    commit({ ...docRef.current, comments: [...(docRef.current.comments || []), { id: uid(), start, end, text: text.trim(), resolved: false }] }, 'comment', selectionRef.current);
  };
  const resolveComment = (id, resolved = true) => {
    const current = docRef.current;
    commit({ ...current, comments: current.comments.map(c => c.id === id ? { ...c, resolved } : c) }, 'comment', selectionRef.current);
  };
  const removeComment = id => commit({ ...docRef.current, comments: docRef.current.comments.filter(c => c.id !== id) }, 'comment', selectionRef.current);
  const insertImage = file => {
    if (editMode !== 'editing' || !file) return;
    if (!file.type.startsWith('image/')) { window.alert('Please choose an image.'); return; }
    if (file.size > 800000) { window.alert('For local drafts, choose an image smaller than 800 KB. Larger image storage comes later.'); return; }
    // Capture the insertion anchor before the asynchronous FileReader completes.
    const insertion = selectionRef.current.start;
    const placement = locateEmbedAtCaret(editorRef.current, insertion);
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result || '');
      if (!src.startsWith('data:image/')) return;
      const current = docRef.current;
      commit({ ...current, embeds: [...(current.embeds || []), { type: 'image', id: uid(), src, alt: file.name, offset: insertion, ...placement }] }, 'image', selectionRef.current);
    };
    reader.readAsDataURL(file);
  };
  const removeImage = id => commit({ ...docRef.current, embeds: docRef.current.embeds.filter(e => e.id !== id) }, 'image', selectionRef.current);

  const addEmbed = block => {
    if (editMode !== 'editing' || !block) return;
    const insertion = selectionRef.current.start;
    const placement = locateEmbedAtCaret(editorRef.current, insertion);
    commit({ ...docRef.current, embeds: [...(docRef.current.embeds || []), { ...block, id: uid(), offset: insertion, ...placement }] }, 'embed');
  };
  const updateEmbed = (id, changes) => {
    if (editMode !== 'editing') return;
    commit({ ...docRef.current, embeds: (docRef.current.embeds || []).map(e => e.id === id ? { ...e, ...changes } : e) }, 'embed');
    // Object fields manage their own focus. Committing a table/chart value
    // must not return focus to the main document editor.
    restoreRef.current = null;
  };
  const suggestReplacement = replacement => {
    if (editMode !== 'editing') return;
    const { start, end } = selectionRef.current;
    if (start === end) return;
    commit({ ...docRef.current, suggestions: [...(docRef.current.suggestions || []),
      { id: uid(), start, end, before: docRef.current.text.slice(start, end), replacement: String(replacement).slice(0, 3000) }] }, 'suggestion');
  };
  const resolveSuggestion = (id, accept = false) => {
    const item = (docRef.current.suggestions || []).find(s => s.id === id);
    if (!item) return;
    if (accept && docRef.current.text.slice(item.start, item.end) !== item.before) {
      window.alert('This suggested range has changed since the suggestion was created. Reject or recreate it.'); return;
    }
    if (accept && editMode === 'editing') replaceText(item.start, item.end, item.replacement, 'suggestion');
    commit({ ...docRef.current, suggestions: (docRef.current.suggestions || []).filter(s => s.id !== id) }, 'suggestion');
  };
  const restoreHistoryEntry = entry => {
    if (!entry) return;
    docRef.current = entry.doc;
    setDoc(entry.doc);
    restoreRef.current = entry.selection;
    selectionRef.current = entry.selection;
    setSelection(entry.selection);
    pendingFormatsRef.current = null;
    setPendingFormats(null);
    refreshHistory();
  };
  const undo = () => restoreHistoryEntry(undoHistory(historyRef.current, docRef.current, selectionRef.current));
  const redo = () => restoreHistoryEntry(redoHistory(historyRef.current, docRef.current, selectionRef.current));
  const updateTitle = title => {
    docRef.current = { ...docRef.current, title: title.slice(0, 120), updatedAt: Math.max(Date.now(), (docRef.current.updatedAt || 0) + 1) };
    setDoc(docRef.current);
  };
  const updateExtension = raw => {
    const extension = normalizeExtension(raw);
    if (!extension || extension === docRef.current.extension) return;
    docRef.current = { ...docRef.current, extension,
      updatedAt: Math.max(Date.now(), (docRef.current.updatedAt || 0) + 1) };
    setDoc(docRef.current);
  };
  const toggleFavorite = () => {
    docRef.current = { ...docRef.current, favorite: !docRef.current.favorite, updatedAt: Date.now() };
    setDoc(docRef.current);
  };
  const replaceDocument = replacement => {
    historyRef.current = createHistory();
    setPendingFormats(null); pendingFormatsRef.current = null;
    const nextDoc = { ...replacement, updatedAt: Math.max(Date.now(), (docRef.current.updatedAt || 0) + 1) };
    docRef.current = nextDoc;
    restoreRef.current = makeSelection(0);
    selectionRef.current = initialSelection;
    setSelection(initialSelection);
    setDoc(nextDoc);
    refreshHistory();
  };
  const newDocument = () => { if (window.confirm('Start a blank document? This replaces the current locally saved draft.')) replaceDocument(makeBlankDocument()); };
  const newFromTemplate = (title, text) => {
    if (editMode !== 'editing') return false;
    if (!window.confirm('Replace the current draft with this template? Save or export a backup first.')) return false;
    replaceDocument({ ...makeBlankDocument(), title, text, paragraphs: paragraphsForText(text) });
    return true;
  };
  const importBinaryMetadata = file => {
    replaceDocument({ ...makeBlankDocument(), title: file.name.replace(/\.[^.]+$/, '').slice(0, 120),
      extension: normalizeExtension(file.name.split('.').pop()) || '.bin' });
    setEditMode('viewing');
  };
  const importText = async file => {
    if (!file) return;
    const text = normalizeText(await file.text());
    replaceDocument({ ...makeBlankDocument(), text, paragraphs: paragraphsForText(text), title: file.name.replace(/\.[^.]+$/, '').slice(0, 120), extension: normalizeExtension(file.name.split('.').pop()) || '.txt' });
  };
  const downloadText = () => {
    const blob = new Blob([docRef.current.text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(docRef.current.title || 'Untitled document').replace(/[\\/:*?"<>|]/g, '-')}.txt`;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const saveNow = () => {
    if (legacyDraftBlocked) {
      setSaveStatus('Legacy NXTF draft protected — recover using Patch 20');
      return Promise.resolve(false);
    }
    const current = docRef.current;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
      setSavedRevision(current.updatedAt);
      setSaveStatus('Saved locally');
      return Promise.resolve(true);
    } catch {
      setSaveStatus('Local storage full / unavailable');
      return Promise.resolve(false);
    }
  };
  useEffect(() => {
    if (legacyDraftBlocked) return undefined;
    setSaveStatus('Saving…');
    const id = setTimeout(() => { saveNow(); }, AUTOSAVE_IDLE_MS);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, legacyDraftBlocked]);
  const insertAtSelection = (value, kind = 'edit') => {
    if (editMode !== 'editing') return;
    const selected = getEditorSelection(editorRef.current) || selectionRef.current;
    rememberSelection(selected);
    replaceText(selected.start, selected.end, String(value), kind);
  };
  const pasteFragment = (input, plainOnly = false) => {
    if (editMode !== 'editing') return;
    const fragment = normalizeFragment(input);
    if (!fragment) return;
    const selected = getEditorSelection(editorRef.current) || selectionRef.current;
    rememberSelection(selected);
    replaceText(selected.start, selected.end, fragment.text, 'paste', plainOnly ? null : fragment);
  };
  const findText = (query, matchCase = false) => {
    if (!query) return false;
    const content = matchCase ? docRef.current.text : docRef.current.text.toLocaleLowerCase();
    const search = matchCase ? query : query.toLocaleLowerCase();
    const start = selectionRef.current.end;
    let position = content.indexOf(search, start);
    if (position < 0) position = content.indexOf(search, 0);
    if (position < 0) return false;
    const next = makeSelection(position, position + query.length);
    selectionRef.current = next;
    setSelection(next);
    restoreRef.current = next;
    requestAnimationFrame(() => {
      restoreEditorSelection(editorRef.current, next.anchor, next.focus);
      const sel = window.getSelection();
      sel?.anchorNode?.parentElement?.scrollIntoView?.({ block: 'nearest' });
    });
    return true;
  };

  const applyDelete = (inputType, start, end) => {
    const text = docRef.current.text;
    if (start === end) {
      if (inputType === 'deleteContentBackward') {
        if (!start) return;
        start--;
        if (start > 0 && /[\uDC00-\uDFFF]/u.test(text[start]) && /[\uD800-\uDBFF]/u.test(text[start - 1])) start--;
      } else if (inputType === 'deleteContentForward') {
        if (end >= text.length) return;
        end++;
        if (end < text.length && /[\uD800-\uDBFF]/u.test(text[end - 1]) && /[\uDC00-\uDFFF]/u.test(text[end])) end++;
      } else if (inputType === 'deleteWordBackward') {
        const match = text.slice(0, start).match(/(?:\s+|\S+)$/u);
        start -= match ? match[0].length : 1;
      } else if (inputType === 'deleteWordForward') {
        const match = text.slice(end).match(/^(?:\s+|\S+)/u);
        end += match ? match[0].length : 1;
      } else return;
    }
    replaceText(start, end, '', 'delete');
  };
  const onBeforeInput = e => {
    const native = e.nativeEvent || e;
    // This is a *native* bubbling listener on the document surface. React's
    // stopPropagation in ObjectField runs too late to block this listener.
    if (isEmbeddedObjectEvent(native.target)) return;
    if (editMode !== 'editing' || composingRef.current || native.isComposing) return;
    const inputType = native.inputType;
    const s = getEditorSelection(editorRef.current) || selectionRef.current;
    rememberSelection(s);
    if (inputType === 'insertText' || inputType === 'insertReplacementText') {
      if (typeof native.data !== 'string') return;
      e.preventDefault(); replaceText(s.start, s.end, native.data, 'type');
    } else if (inputType === 'insertParagraph' || inputType === 'insertLineBreak') {
      e.preventDefault(); replaceText(s.start, s.end, '\n');
    } else if (['deleteContentBackward', 'deleteContentForward', 'deleteWordBackward', 'deleteWordForward', 'deleteByCut', 'deleteContent'].includes(inputType)) {
      e.preventDefault(); applyDelete(inputType, s.start, s.end);
    } else if (inputType === 'historyUndo') { e.preventDefault(); undo(); }
    else if (inputType === 'historyRedo') { e.preventDefault(); redo(); }
    else if (inputType === 'formatBold' || inputType === 'formatItalic' || inputType === 'formatUnderline') {
      e.preventDefault(); toggleFormat(inputType.replace('format', '').toLowerCase());
    }
  };
  const reconcileDOM = event => {
    if (isEmbeddedObjectEvent(event?.target) || isEmbeddedObjectFocused()) return;
    const root = editorRef.current;
    if (!root || composingRef.current || editMode !== 'editing') return;
    const text = readEditorText(root);
    const original = docRef.current.text;
    if (original === text) return;
    let from = 0;
    while (from < original.length && from < text.length && original[from] === text[from]) from++;
    let oldEnd = original.length, newEnd = text.length;
    while (oldEnd > from && newEnd > from && original[oldEnd - 1] === text[newEnd - 1]) { oldEnd--; newEnd--; }
    const postInputSelection = getEditorSelection(root);
    replaceText(from, oldEnd, text.slice(from, newEnd));
    if (postInputSelection) restoreRef.current = { anchor: postInputSelection.anchor, focus: postInputSelection.focus };
  };
  useEffect(() => {
    const root = editorRef.current;
    if (!root) return undefined;
    root.addEventListener('beforeinput', onBeforeInput);
    return () => root.removeEventListener('beforeinput', onBeforeInput);
  });
  const onCopy = e => {
    if (isEmbeddedObjectEvent(e.target)) return;
    const s = getEditorSelection(editorRef.current);
    if (!s || s.start === s.end || !e.clipboardData) return;
    const fragment = fragmentFromDocument(docRef.current, s.start, s.end);
    copiedFragmentRef.current = fragment;
    e.preventDefault();
    e.clipboardData.setData('text/plain', fragment.text);
    e.clipboardData.setData('text/html', fragmentToHTML(fragment));
    try { e.clipboardData.setData(NEXA_CLIPBOARD_TYPE, JSON.stringify(fragment)); } catch { /* unsupported custom MIME */ }
  };
  const onPaste = e => {
    if (isEmbeddedObjectEvent(e.target)) return;
    if (editMode !== 'editing') { e.preventDefault(); return; }
    e.preventDefault();
    const plainOnly = plainPasteRef.current || e.shiftKey && (e.ctrlKey || e.metaKey);
    plainPasteRef.current = false;
    const fragment = fragmentFromClipboardData(e.clipboardData, plainOnly);
    pasteFragment(fragment, plainOnly);
  };
  const onCut = e => {
    if (isEmbeddedObjectEvent(e.target)) return;
    if (editMode !== 'editing') { e.preventDefault(); return; }
    const s = getEditorSelection(editorRef.current);
    if (!s || s.start === s.end) return;
    onCopy(e);
    replaceText(s.start, s.end, '', 'delete');
  };
  const onKeyDown = e => {
    if (isEmbeddedObjectEvent(e.target)) return;
    if (editMode !== 'editing') return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod) {
      const key = e.key.toLowerCase();
      if (key === 'a') { e.preventDefault(); selectAll(); }
      else if (['b', 'i', 'u'].includes(key)) { e.preventDefault(); toggleFormat({ b: 'bold', i: 'italic', u: 'underline' }[key]); }
      else if (key === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if (key === 'y') { e.preventDefault(); redo(); }
      else if (key === 's') { e.preventDefault(); saveNow(); }
      else if (key === 'k') { e.preventDefault(); addLink(); }
      else if (key === 'x' && e.shiftKey) { e.preventDefault(); toggleFormat('strike'); }
      else if (key === 'v' && e.shiftKey) { plainPasteRef.current = true; setTimeout(() => { plainPasteRef.current = false; }, 400); }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const index = paragraphAt(docRef.current.text, selectionRef.current.start);
      if (docRef.current.paragraphs?.[index]?.list !== 'none') changeIndent(e.shiftKey ? -1 : 1);
      else insertAtSelection('    ');
    }
  };

  const selectedText = () => {
    const { start, end } = selectionRef.current;
    return docRef.current.text.slice(start, end);
  };
  const selectAll = () => {
    const next = makeSelection(0, docRef.current.text.length);
    selectionRef.current = next; setSelection(next); restoreRef.current = next;
    restoreEditorSelection(editorRef.current, next.anchor, next.focus);
  };
  const deleteSelection = () => {
    const { start, end } = selectionRef.current;
    if (end > start) replaceText(start, end, '', 'delete');
  };
  const clipboardCopy = async (cut = false) => {
    const { start, end } = selectionRef.current;
    if (start === end) return false;
    const fragment = fragmentFromDocument(docRef.current, start, end);
    try {
      // Browser clipboard APIs may require HTTPS/localhost and user approval.
      if (navigator.clipboard.write && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([new ClipboardItem({
          'text/plain': new Blob([fragment.text], { type: 'text/plain' }),
          'text/html': new Blob([fragmentToHTML(fragment)], { type: 'text/html' }),
        })]);
      } else await navigator.clipboard.writeText(fragment.text);
      copiedFragmentRef.current = fragment;
      if (cut) replaceText(start, end, '', 'delete');
      return true;
    } catch {
      window.alert('Clipboard access was denied. Try Ctrl+C or Ctrl+X in the editor.');
      return false;
    }
  };
  const clipboardPaste = async (plain = false) => {
    try {
      let text = null;
      let html = null;
      if (navigator.clipboard.read) {
        const items = await navigator.clipboard.read();
        for (const entry of items) {
          if (!plain && entry.types.includes('text/html')) html = await (await entry.getType('text/html')).text();
          if (entry.types.includes('text/plain')) text = await (await entry.getType('text/plain')).text();
          if (html !== null || text !== null) break;
        }
      } else text = await navigator.clipboard.readText();
      if (text === null && !html) text = await navigator.clipboard.readText();
      if (plain) insertAtSelection(text ?? fragmentFromHTML(html)?.text ?? '', 'paste');
      else if (html) {
        const converted = fragmentFromHTML(html);
        if (converted) pasteFragment(converted);
        else insertAtSelection(text ?? '', 'paste');
      }
      else if (copiedFragmentRef.current && copiedFragmentRef.current.text === text) pasteFragment(copiedFragmentRef.current);
      else insertAtSelection(text ?? '', 'paste');
      return true;
    } catch {
      // Some browsers allow readText but prohibit reading HTML formats.
      try {
        const text = await navigator.clipboard.readText();
        if (!plain && copiedFragmentRef.current?.text === text) pasteFragment(copiedFragmentRef.current);
        else insertAtSelection(text, 'paste');
        return true;
      } catch {
        window.alert('Clipboard access was denied. Focus the document and press Ctrl+V instead.');
        return false;
      }
    }
  };
  const replaceMatches = (query, replacement, replaceAll = false, matchCase = false) => {
    if (editMode !== 'editing' || !query) return 0;
    const current = docRef.current;
    const source = matchCase ? current.text : current.text.toLocaleLowerCase();
    const needle = matchCase ? query : query.toLocaleLowerCase();
    const matches = [];
    for (let at = source.indexOf(needle); at !== -1; at = source.indexOf(needle, at + needle.length)) matches.push(at);
    if (!matches.length) return 0;
    if (!replaceAll) {
      const from = matches.find(at => at >= selectionRef.current.start) ?? matches[0];
      replaceText(from, from + query.length, replacement, 'replace');
      return 1;
    }
    let text = current.text;
    let formats = current.formats;
    let paragraphs = current.paragraphs;
    let comments = current.comments || [];
    let embeds = current.embeds || [];
    let bookmarks = current.bookmarks || [];
    for (const start of matches.reverse()) {
      const end = start + query.length;
      const next = text.slice(0, start) + replacement + text.slice(end);
      const diff = replacement.length - (end - start);
      formats = transformRangesForReplace(formats, start, end, replacement.length, []);
      paragraphs = transformParagraphs(text, next, paragraphs, start, end, replacement.length);
      comments = transformAnnotationRanges(comments, start, end, replacement.length);
      embeds = embeds.map(e => ({ ...e, offset: e.offset >= end ? e.offset + diff : e.offset > start ? start + replacement.length : e.offset }));
      bookmarks = bookmarks.map(b => ({ ...b, offset: b.offset >= end ? b.offset + diff : b.offset > start ? start + replacement.length : b.offset }));
      text = next;
    }
    commit({ ...current, text, formats, paragraphs, comments, embeds, bookmarks }, 'replaceAll', makeSelection(0));
    return matches.length;
  };
  const exportDocument = format => {
    const current = docRef.current;
    const filename = (current.title || 'Untitled document').replace(/[\\/:*?"<>|]/g, '-');
    if (format === 'original') {
      // These extensions are plain-text source formats. Never mislabel HTML as
      // PDF, DOCX, or an executable; ByteFrame handles raw binary downloads.
      const allowed = new Set(['.txt', '.md', '.csv', '.log', '.json', '.js', '.jsx', '.ts',
        '.tsx', '.py', '.rs', '.c', '.h', '.cpp', '.css', '.html', '.xml', '.yaml', '.yml',
        '.sh', '.java', '.ini', '.toml']);
      const extension = String(current.extension || '.txt').toLowerCase();
      if (!allowed.has(extension)) {
        window.alert(`.${extension.replace(/^\./, '')} cannot be exported as a faithful original-format file from rich text. Use a text format, or use ByteFrame for binary files.`);
        return;
      }
      saveBlob(current.text, filename + extension, 'text/plain;charset=utf-8');
      return;
    }
    if (format === 'json') saveBlob(JSON.stringify(current, null, 2), filename + '.nexa.json', 'application/json');
    else if (format === 'html') saveBlob(documentToHTML(current), filename + '.html', 'text/html;charset=utf-8');
    else if (format === 'markdown') saveBlob(current.text, filename + '.md', 'text/markdown;charset=utf-8');
    else saveBlob(current.text, filename + '.txt', 'text/plain;charset=utf-8');
  };
  // Import a Nexa Docs JSON backup (the inverse of exportDocument('json')).
  // This remains available in the web editor after removing NXTF support.
  const importBackup = async file => {
    if (!file) return;
    const data = JSON.parse(await file.text());
    const result = validateDocument(data);
    if (!result) throw new Error('Invalid Nexa document backup');
    replaceDocument({ ...result, title: data.title || file.name });
  };
  const discardLegacyNxtfPointer = () => {
    if (!window.confirm('An NXTF browser draft from the previous version was detected. This app cannot open it. Have you exported or backed it up using Patch 20? Continuing will replace the browser draft pointer.')) return;
    setLegacyDraftBlocked(false);
    replaceDocument(makeBlankDocument());
  };
  const LIBRARY_KEY = 'nexa-docs:snapshots:v1';
  const listSnapshots = () => {
    try { return JSON.parse(localStorage.getItem(LIBRARY_KEY) || '[]'); } catch { return []; }
  };
  const saveSnapshot = (source = docRef.current) => {
    try {
      const entries = listSnapshots();
      entries.unshift({ ...source, id: uid(), savedAt: Date.now() });
      localStorage.setItem(LIBRARY_KEY, JSON.stringify(entries.slice(0, 20)));
      return true;
    } catch { window.alert('Browser storage is full. Export a Nexa JSON backup instead.'); return false; }
  };
  const trashDocument = () => {
    if (!window.confirm('Move the current draft to local snapshots and open a blank document?')) return;
    if (!saveSnapshot()) return;
    replaceDocument(makeBlankDocument());
  };
  const makeCopy = () => {
    if (!saveSnapshot()) return;
    const next = { ...docRef.current, id: uid(), title: `Copy of ${docRef.current.title}`, updatedAt: Date.now() };
    replaceDocument(next);
    saveSnapshot(next);
  };
  const openSnapshot = data => {
    const result = validateDocument(data);
    if (result && window.confirm('Open this local snapshot and replace the current draft?')) {
      saveSnapshot(); replaceDocument({ ...result, id: data.id || uid() });
    }
  };
  const updatePage = pageSettings => {
    commit({ ...docRef.current, pageSettings: { ...(docRef.current.pageSettings || {}), ...('margin' in pageSettings ? { topMargin: pageSettings.margin, bottomMargin: pageSettings.margin, leftMargin: pageSettings.margin, rightMargin: pageSettings.margin } : {}), ...pageSettings } }, 'page', selectionRef.current);
  };
  // A page break is a paragraph-level marker, not a literal form-feed byte.
  // This preserves UTF-16 text offsets and all existing formatting ranges.
  const insertPageBreak = () => {
    if (editMode !== 'editing') return;
    const { start, end } = selectionRef.current;
    const oldText = docRef.current.text;
    if (start > 0 && oldText[start - 1] === '\n' && start === end) {
      const paragraphs = paragraphsForText(oldText, docRef.current.paragraphs);
      const index = paragraphAt(oldText, start);
      paragraphs[index] = { ...paragraphs[index], pageBreakBefore: true };
      commit({ ...docRef.current, paragraphs }, 'page-break');
    } else {
      replaceText(start, end, '\n', 'page-break');
      const updated = docRef.current;
      const paragraphs = paragraphsForText(updated.text, updated.paragraphs);
      const index = paragraphAt(updated.text, start + 1);
      paragraphs[index] = { ...paragraphs[index], pageBreakBefore: true };
      // Replace history's last snapshot grouping with a single operation.
      docRef.current = { ...updated, paragraphs };
      setDoc(docRef.current);
    }
  };
  const addCitation = source => {
    if (editMode !== 'editing' || !source?.title?.trim()) return;
    const record = { id: uid(), title: source.title.trim().slice(0, 180), author: (source.author || '').trim().slice(0, 140), year: (source.year || '').trim().slice(0, 20), url: (source.url || '').trim().slice(0, 600) };
    commit({ ...docRef.current, citations: [...(docRef.current.citations || []), record] }, 'citation');
    insertAtSelection(` [${docRef.current.citations.length}]`);
  };
  const addBookmark = () => {
    const input = window.prompt('Bookmark name:', `Bookmark ${(docRef.current.bookmarks || []).length + 1}`);
    if (!input?.trim()) return;
    const bookmark = { id: uid(), label: input.trim().slice(0, 80), offset: selectionRef.current.start };
    commit({ ...docRef.current, bookmarks: [...(docRef.current.bookmarks || []), bookmark] }, 'bookmark', selectionRef.current);
  };
  const goToOffset = (offset, end = offset) => {
    const next = makeSelection(offset, end);
    selectionRef.current = next; setSelection(next); restoreRef.current = next;
    requestAnimationFrame(() => {
      restoreEditorSelection(editorRef.current, next.anchor, next.focus);
      // ByteFrame's section links, bookmarks and chunk navigation may point to
      // content several pages away. Bring the selected document position into
      // view instead of merely moving the invisible caret.
      const target = window.getSelection()?.anchorNode;
      const element = target?.nodeType === Node.ELEMENT_NODE ? target : target?.parentElement;
      if (element && editorRef.current?.contains(element)) {
        element.scrollIntoView?.({ block: 'center', inline: 'nearest', behavior: 'auto' });
      }
    });
  };

  const selectionStart = selection.start + (selection.start < selection.end ? 1 : 0);
  const currentFormats = pendingFormats !== null ? pendingFormats : formatsAtCaret(doc.formats, selectionStart);
  const activeMarks = TOGGLE_TYPES.filter(type => selection.start === selection.end
    ? currentFormats.some(f => f.type === type)
    : isRangeFormatted(doc.formats, selection.start, selection.end, type));
  const activeValue = (type, fallback) => currentFormats.find(f => f.type === type)?.value ?? fallback;
  const activeParagraph = doc.paragraphs?.[paragraphAt(doc.text, selection.start)] || DEFAULT_PARAGRAPH;
  const wordCount = useResponsiveWordCount(doc.text);
  return {
    doc, editorRef, selection, activeMarks, activeParagraph, activeValue,
    saveStatus, savedRevision, legacyDraftBlocked, discardLegacyNxtfPointer, historyAvailability, wordCount,
    spellcheck, setSpellcheck, editMode, setEditMode, paintActive,
    togglePaint, tryPaint, findText, setTextAttribute, changeParagraph, changeIndent, toggleChecklist, clearFormatting,
    addLink, addComment, resolveComment, removeComment, insertImage, removeImage,
    rememberSelection, syncSelection, replaceText, insertAtSelection, toggleFormat, undo, redo,
    updateTitle, updateExtension, toggleFavorite, newDocument, newFromTemplate, importText, importBinaryMetadata, downloadText, saveNow,
    selectedText, selectAll, deleteSelection, clipboardCopy, clipboardPaste, replaceMatches, exportDocument, importBackup,
    listSnapshots, saveSnapshot, makeCopy, trashDocument, openSnapshot, updatePage, addBookmark, insertPageBreak, addCitation, addEmbed, updateEmbed, suggestReplacement, resolveSuggestion, goToOffset,
    restoreRef, composingRef,
    editorEvents: {
      onInput: reconcileDOM, onPaste, onCopy, onCut, onKeyDown,
      onCompositionStart: e => { if (!isEmbeddedObjectEvent(e.target)) composingRef.current = true; },
      onCompositionEnd: e => { if (!isEmbeddedObjectEvent(e.target)) { composingRef.current = false; setTimeout(reconcileDOM, 0); } },
      onMouseUp: e => { if (isEmbeddedObjectEvent(e.target)) return; syncSelection(); if (paintActive) requestAnimationFrame(tryPaint); },
      onKeyUp: e => { if (!isEmbeddedObjectEvent(e.target)) syncSelection(); },
    },
  };
}
