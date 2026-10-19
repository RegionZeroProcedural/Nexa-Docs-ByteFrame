import { BUILTIN_ADDONS, runBuiltinAddon } from './builtinAddons';
const editorFor = (text, start, end) => ({ doc: { text }, selection: { start, end }, editMode: 'editing', replaceText: jest.fn() });
test('every built-in has a unique id and an executable handler', () => {
  expect(new Set(BUILTIN_ADDONS.map(a => a.id)).size).toBe(BUILTIN_ADDONS.length);
  expect(BUILTIN_ADDONS.every(a => typeof a.run === 'function')).toBe(true);
});
test('uppercases only the selection through the editor API', () => {
  const editor = editorFor('hi there', 3, 8);
  runBuiltinAddon('uppercase', editor);
  expect(editor.replaceText).toHaveBeenCalledWith(3, 8, 'THERE', 'edit');
});
test('does not change a document in viewing mode', () => {
  const editor = editorFor('hi', 0, 2); editor.editMode = 'viewing';
  expect(runBuiltinAddon('uppercase', editor)).toMatch(/Editing/);
  expect(editor.replaceText).not.toHaveBeenCalled();
});
