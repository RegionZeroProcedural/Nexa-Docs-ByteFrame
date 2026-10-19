import { FORMAT_TYPES } from './editRanges';
import { paragraphsForText } from './paragraphs';
export const STORAGE_KEY = 'nexa-docs:draft:v1';
const clampPosition = value => Math.min(5000, Math.max(0, Math.round(value))); 
const INITIAL_TEXT = 'Welcome to Nexa Docs\n\nYour workspace for ideas, writing, and everything in between.\n\nSelect some text to apply bold, italic, or underline. Every style is stored as a range, independently of the text itself.\n\nThis version of Nexa Docs is a browser-first editor. ByteFrame provides optional hex and opcode inspection.';
export function createDocument() {
  return {
    id: 'local-draft', title: 'Untitled document', extension: '.txt', text: INITIAL_TEXT,
    formats: [
      { id: 'seed-heading', start: 0, end: 20, type: 'bold' },
      { id: 'seed-bold', start: INITIAL_TEXT.indexOf('bold, italic'), end: INITIAL_TEXT.indexOf('bold, italic') + 4, type: 'bold' },
      { id: 'seed-italic', start: INITIAL_TEXT.indexOf('italic, or'), end: INITIAL_TEXT.indexOf('italic, or') + 6, type: 'italic' },
      { id: 'seed-underline', start: INITIAL_TEXT.indexOf('underline.'), end: INITIAL_TEXT.indexOf('underline.') + 9, type: 'underline' },
    ],
    paragraphs: paragraphsForText(INITIAL_TEXT), comments: [], embeds: [], citations: [], suggestions: [],
    favorite: false, pageSettings: { width: 816, height: 1056, margin: 96, leftMargin: 96, rightMargin: 96, topMargin: 96, bottomMargin: 96, columns: 1, headerText: '', footerText: '', showPageNumbers: false }, bookmarks: [], updatedAt: Date.now(),
  };
}
export function makeBlankDocument() {
  return { id: 'local-draft', title: 'Untitled document', extension: '.txt', text: '', formats: [], paragraphs: paragraphsForText(''), comments: [], embeds: [], citations: [], suggestions: [], favorite: false, pageSettings: { width: 816, height: 1056, margin: 96, leftMargin: 96, rightMargin: 96, topMargin: 96, bottomMargin: 96, columns: 1, headerText: '', footerText: '', showPageNumbers: false }, bookmarks: [], updatedAt: Date.now() };
}
export function validateDocument(data) {
  if (!data || typeof data !== 'object' || typeof data.text !== 'string') return null;
  const max = data.text.length;
  // Prior releases used 100px as the untouched default on all four sides.
  // Upgrade only that exact factory configuration; preserve custom margins.
  const oldDefault = data.pageSettings && ['margin','leftMargin','rightMargin','topMargin','bottomMargin']
    .every(key => Number(data.pageSettings[key]) === 100) && Number(data.pageSettings.width) === 816;
  const inputPage = oldDefault ? { ...data.pageSettings, margin:96, leftMargin:96, rightMargin:96, topMargin:96, bottomMargin:96 } : data.pageSettings;
  return {
    id: 'local-draft', extension: typeof data.extension === 'string' && /^\.[a-z0-9_-]{1,12}$/i.test(data.extension) && data.extension.toLowerCase() !== '.nxtf' ? data.extension.toLowerCase() : '.txt',
    title: typeof data.title === 'string' ? data.title.slice(0, 120) : 'Untitled document', text: data.text,
    formats: Array.isArray(data.formats) ? data.formats.filter(f => f && FORMAT_TYPES.includes(f.type)
      && Number.isInteger(f.start) && Number.isInteger(f.end) && f.start >= 0 && f.end > f.start && f.end <= max
      && (f.value === undefined || typeof f.value === 'string' || typeof f.value === 'number')) : [],
    paragraphs: paragraphsForText(data.text, Array.isArray(data.paragraphs) ? data.paragraphs : []),
    suggestions: Array.isArray(data.suggestions) ? data.suggestions.filter(s => s && typeof s.replacement === 'string' && Number.isInteger(s.start) && Number.isInteger(s.end) && s.start >= 0 && s.end <= max && s.start <= s.end).slice(0, 500) : [],
    comments: Array.isArray(data.comments) ? data.comments.filter(c => c && typeof c.text === 'string' && c.start >= 0 && c.end <= max) : [],
    citations: Array.isArray(data.citations) ? data.citations.filter(c => c && typeof c.title === 'string').slice(0, 200) : [],
    embeds: Array.isArray(data.embeds) ? data.embeds.filter(e => e && (
      (e.type === 'image' && typeof e.src === 'string' && e.src.startsWith('data:image/') && e.src.length < 1500000) ||
      (e.type === 'table' && Array.isArray(e.rows) && e.rows.length <= 30 && e.rows.every(row => Array.isArray(row) && row.length <= 12 && row.every(c => typeof c === 'string' && c.length <= 600))) ||
      (e.type === 'chart' && Array.isArray(e.points) && e.points.length <= 30 && e.points.every(pt => pt && typeof pt.label === 'string' && pt.label.length <= 90 && Number.isFinite(Number(pt.value))))
    )).map(e => ({ ...e, pageIndex: Number.isInteger(e.pageIndex) && e.pageIndex >= 0 ? Math.min(2000, e.pageIndex) : undefined,
      position: e.position && Number.isFinite(e.position.x) && Number.isFinite(e.position.y)
        ? { x: clampPosition(e.position.x), y: clampPosition(e.position.y) } : undefined })) : [],
    pageSettings: { width: [816, 794, 1123, 1056].includes(inputPage?.width) ? inputPage.width : 816, height: [1056, 1123, 794, 816].includes(inputPage?.height) ? inputPage.height : 1056, margin: Number.isFinite(inputPage?.margin) && inputPage.margin >= 24 && inputPage.margin <= 350 ? inputPage.margin : 96, leftMargin: Number.isFinite(inputPage?.leftMargin) && inputPage.leftMargin >= 24 && inputPage.leftMargin <= 350 ? inputPage.leftMargin : (inputPage?.margin || 96), rightMargin: Number.isFinite(inputPage?.rightMargin) && inputPage.rightMargin >= 24 && inputPage.rightMargin <= 350 ? inputPage.rightMargin : (inputPage?.margin || 96), topMargin: Number.isFinite(inputPage?.topMargin) && inputPage.topMargin >= 24 && inputPage.topMargin <= 400 ? inputPage.topMargin : (inputPage?.margin || 96), bottomMargin: Number.isFinite(inputPage?.bottomMargin) && inputPage.bottomMargin >= 24 && inputPage.bottomMargin <= 400 ? inputPage.bottomMargin : (inputPage?.margin || 96),
      columns: [1,2,3].includes(Number(inputPage?.columns)) ? Number(inputPage.columns) : 1,
      headerText: typeof inputPage?.headerText === 'string' ? inputPage.headerText.slice(0, 160) : '',
      footerText: typeof inputPage?.footerText === 'string' ? inputPage.footerText.slice(0, 160) : '',
      showPageNumbers: !!inputPage?.showPageNumbers },
    bookmarks: Array.isArray(data.bookmarks) ? data.bookmarks.filter(b => b && typeof b.label === 'string' && Number.isInteger(b.offset) && b.offset >= 0 && b.offset <= max) : [],
    favorite: Boolean(data.favorite), updatedAt: Number.isFinite(data.updatedAt) ? data.updatedAt : Date.now(),
  };
}
export function loadDraft() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDocument();
    const parsed = JSON.parse(raw);
    // Never overwrite a legacy browser-only NXTF pointer on startup.
    // The user must export the old draft from the prior version first.
    if (parsed?.storage === 'nxtf-idb-v1') return { ...makeBlankDocument(), __legacyStoragePointer: true };
    if (parsed?.extension === '.nxtf') return { ...makeBlankDocument(), __legacyStoragePointer: true };
    return validateDocument(parsed) || createDocument();
  } catch { return createDocument(); }
}
export function getWordCount(text) {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/u).length : 0;
}
