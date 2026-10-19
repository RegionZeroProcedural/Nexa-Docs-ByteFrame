import buildMenus from './buildMenus';
const fn = () => {};
function fakeEditor() {
  const functions = { selectedText: () => '', newDocument: fn, saveNow: fn, historyAvailability: { undo: true, redo: true },
    doc: { title: 'Test', extension: '.txt', text: '', pageSettings: {} }, selection: { start: 0, end: 0 },
    activeParagraph: { style: 'normal', align: 'left', spacing: 1.5 }, editMode: 'editing', spellcheck: true };
  return new Proxy(functions, { get: (target, property) => property in target ? target[property] : fn });
}
function fakeView() {
  const view = { binaryFile: false, printLayout: true, language: 'English (United States)', showComments: true,
    page: { width: 816, height: 1056 }, showResolved: false };
  return new Proxy(view, { get: (target, property) => property in target ? target[property] : fn });
}
test('all enabled menu entries have executable actions and disabled entries explain why', () => {
  const groups = buildMenus(fakeEditor(), fakeView(), { imageRef: { current: null }, openFile: fn });
  expect(groups.map(g => g.label)).toEqual(['File','Edit','View','Insert','Format','Tools','Extensions','Help']);
  const check = (menu) => { for (const choice of menu) {
    if (choice.separator) continue;
    if (choice.children) { expect(choice.children.length).toBeGreaterThan(0); check(choice.children); }
    else if (choice.disabled) expect(choice.reason).toBeTruthy();
    else expect(typeof choice.action).toBe('function');
  }};
  groups.forEach(group => check(group.items));
});
