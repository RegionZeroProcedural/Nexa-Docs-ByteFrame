import { clamp, locateEmbedAtCaret } from './embedPosition';

test('clamps document objects into an editable page rectangle', () => {
  expect(clamp(-50, 8, 300)).toBe(8);
  expect(clamp(450, 8, 300)).toBe(300);
  expect(clamp(120, 8, 300)).toBe(120);
});

test('inserting an object before the editor is mounted has a safe fallback', () => {
  expect(locateEmbedAtCaret(null, 0)).toEqual({ pageIndex: 0, position: null });
});
