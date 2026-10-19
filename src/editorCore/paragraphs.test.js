import { lineStarts, paragraphAt, paragraphsForText, transformParagraphs, selectedParagraphIndexes, setParagraphProperty } from './paragraphs';

test('offsets and selection end are evaluated per paragraph', () => {
  expect(lineStarts('A\nBC\nD')).toEqual([0, 2, 5]);
  expect(paragraphAt('A\nBC\nD', 5)).toBe(2);
  expect(selectedParagraphIndexes('A\nBC\nD', 0, 2)).toEqual([0]);
  expect(selectedParagraphIndexes('A\nBC\nD', 0, 3)).toEqual([0, 1]);
});

test('newline insertion duplicates source paragraph formatting; later paragraphs stay intact', () => {
  const old = 'Alpha\nBravo';
  const updated = 'Al\npha\nBravo';
  const paragraphs = paragraphsForText(old, [{ style: 'h1' }, { list: 'number' }]);
  const result = transformParagraphs(old, updated, paragraphs, 2, 2, 1);
  expect(result.map(p => [p.style, p.list])).toEqual([['h1', 'none'], ['h1', 'none'], ['normal', 'number']]);
});

test('paragraph settings apply only to covered lines', () => {
  const paragraphs = setParagraphProperty('A\nB\nC', [], 0, 2, 'align', 'center');
  expect(paragraphs.map(p => p.align)).toEqual(['center', 'left', 'left']);
});
