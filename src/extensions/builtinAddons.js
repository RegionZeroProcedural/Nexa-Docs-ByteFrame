/** First-party local extensions. These operate only through the public editor
 * selection/replace API; no third-party code is executed or downloaded. */
const selectedRange = editor => {
  const { start, end } = editor.selection;
  return end > start ? { start, end, text: editor.doc.text.slice(start, end) } : null;
};
const transform = converter => editor => {
  const range = selectedRange(editor);
  if (!range) return 'Select some document text first.';
  editor.replaceText(range.start, range.end, converter(range.text), 'edit');
  return 'Selection updated. Undo is available.';
};
const titleCase = value => value.toLocaleLowerCase().replace(/(^|[^\p{L}])(\p{L})/gu, (_, sep, letter) => sep + letter.toLocaleUpperCase());
const duplicateLines = text => [...new Set(text.split('\n'))].join('\n');
const reverseLines = text => text.split('\n').reverse().join('\n');
const removeTrailing = text => text.split('\n').map(row => row.replace(/[ \t]+$/g, '')).join('\n');
const collapseSpaces = text => text.replace(/ {2,}/g, ' ');
const insert = converter => editor => {
  const { start, end } = editor.selection;
  editor.replaceText(start, end, converter(), 'edit');
  return 'Inserted. Undo is available.';
};
export const BUILTIN_ADDONS = Object.freeze([
  { id: 'uppercase', label: 'Uppercase', description: 'Convert selected text to uppercase.', needsSelection: true, run: transform(t => t.toLocaleUpperCase()) },
  { id: 'lowercase', label: 'Lowercase', description: 'Convert selected text to lowercase.', needsSelection: true, run: transform(t => t.toLocaleLowerCase()) },
  { id: 'titlecase', label: 'Title case', description: 'Capitalize words in a selection.', needsSelection: true, run: transform(titleCase) },
  { id: 'sort', label: 'Sort lines A → Z', description: 'Sort selected lines alphabetically.', needsSelection: true, run: transform(t => t.split('\n').sort((a, b) => a.localeCompare(b)).join('\n')) },
  { id: 'reverse', label: 'Reverse line order', description: 'Reverse selected lines without changing characters.', needsSelection: true, run: transform(reverseLines) },
  { id: 'unique', label: 'Remove duplicate lines', description: 'Keep the first occurrence of each selected line.', needsSelection: true, run: transform(duplicateLines) },
  { id: 'trailing', label: 'Trim trailing whitespace', description: 'Remove spaces and tabs from the end of each line.', needsSelection: true, run: transform(removeTrailing) },
  { id: 'spaces', label: 'Collapse repeated spaces', description: 'Replace runs of 2+ spaces with one space.', needsSelection: true, run: transform(collapseSpaces) },
  { id: 'timestamp', label: 'Insert local timestamp', description: 'Insert the date and time into the document.', needsSelection: false, run: insert(() => new Date().toLocaleString()) },
  { id: 'uuid', label: 'Insert random UUID', description: 'Generate a random identifier using browser crypto.', needsSelection: false, run: editor => {
    if (!window.crypto?.randomUUID) return 'Your browser does not support secure random UUID generation.';
    return insert(() => window.crypto.randomUUID())(editor);
  } },
  { id: 'wordstats', label: 'Count selected text', description: 'Count words and characters in the selection.', needsSelection: true, run: editor => {
    const t = selectedRange(editor)?.text || ''; return `${(t.trim().match(/\S+/gu) || []).length} words, ${t.length} UTF-16 characters.`;
  } },
  { id: 'jsonpretty', label: 'Format JSON', description: 'Pretty-print valid JSON in the selected text.', needsSelection: true, run: editor => {
    const range = selectedRange(editor); if (!range) return 'Select valid JSON first.';
    try { editor.replaceText(range.start, range.end, JSON.stringify(JSON.parse(range.text), null, 2), 'edit'); return 'JSON formatted.'; }
    catch { return 'Selection is not valid JSON; no changes made.'; }
  } },
  { id: 'urlencode', label: 'URL encode', description: 'Encode selected text for use in a URL.', needsSelection: true, run: transform(encodeURIComponent) },
  { id: 'urldecode', label: 'URL decode', description: 'Decode percent-encoded URL text.', needsSelection: true, run: editor => {
    const range = selectedRange(editor); if (!range) return 'Select text first.';
    try { editor.replaceText(range.start, range.end, decodeURIComponent(range.text), 'edit'); return 'URL text decoded.'; }
    catch { return 'Invalid percent encoding; no changes made.'; }
  } },
]);
export function runBuiltinAddon(id, editor) {
  const addon = BUILTIN_ADDONS.find(a => a.id === id);
  if (!addon) return 'Unknown extension.';
  if (editor.editMode !== 'editing') return 'Switch to Editing mode first.';
  return addon.run(editor);
}
