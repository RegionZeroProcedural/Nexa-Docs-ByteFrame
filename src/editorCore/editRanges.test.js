import { isRangeFormatted, marksAtCaret, toggleRange } from './editRanges';
import { transformRangesForReplace } from './rangeTransforms';
import { getTextRuns } from './formattingParser';

test('bold ranges can be toggled off in the middle without losing edges', () => {
  const bold = [{ id: 'a', start: 0, end: 10, type: 'bold' }];
  const result = toggleRange(bold, 3, 7, 'bold');
  expect(result.map(x => [x.start, x.end])).toEqual([[0, 3], [7, 10]]);
  expect(isRangeFormatted(result, 0, 10, 'bold')).toBe(false);
});

test('inserting before a formatted range shifts it rather than expanding it', () => {
  const ranges = [{ id: 'a', start: 5, end: 10, type: 'bold' }];
  const result = transformRangesForReplace(ranges, 0, 0, 3);
  expect(result[0]).toMatchObject({ start: 8, end: 13 });
});

test('inserting within a formatted range inherits a mark', () => {
  const ranges = [{ id: 'a', start: 0, end: 5, type: 'bold' }];
  const result = transformRangesForReplace(ranges, 2, 2, 1, marksAtCaret(ranges, 2));
  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({ start: 0, end: 6, type: 'bold' });
});

test('deleting overlapping characters contracts formatting', () => {
  const ranges = [{ id: 'a', start: 1, end: 9, type: 'italic' }];
  const result = transformRangesForReplace(ranges, 3, 7, 0);
  expect(result[0]).toMatchObject({ start: 1, end: 5 });
});

test('runs resolve overlapping styling only at boundaries', () => {
  const runs = getTextRuns('abcdef', [
    { start: 0, end: 4, type: 'bold' },
    { start: 2, end: 6, type: 'italic' },
  ], 0);
  expect(runs.map(r => [r.text, r.marks])).toEqual([
    ['ab', ['bold']], ['cd', ['bold', 'italic']], ['ef', ['italic']],
  ]);
});
