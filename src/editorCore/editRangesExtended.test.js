import { clearRangeFormatting, normalizeRanges, setRangeAttribute, valueAtPosition } from './editRanges';
import { transformRangesForReplace, transformAnnotationRanges } from './rangeTransforms';
import { getTextRuns } from './formattingParser';

test('multiple exclusive text colors split correctly without affecting bold', () => {
  let ranges = [{ type: 'bold', start: 0, end: 12 }];
  ranges = setRangeAttribute(ranges, 0, 12, 'color', '#ff0000');
  ranges = setRangeAttribute(ranges, 4, 8, 'color', '#0000ff');
  expect(valueAtPosition(ranges, 2, 'color')).toBe('#ff0000');
  expect(valueAtPosition(ranges, 6, 'color')).toBe('#0000ff');
  expect(valueAtPosition(ranges, 10, 'color')).toBe('#ff0000');
  expect(ranges.filter(r => r.type === 'bold')).toHaveLength(1);
});

test('inserted characters inherit value-bearing formatting, then merge', () => {
  const ranges = [{ type: 'size', value: 16, start: 0, end: 6 }];
  const next = transformRangesForReplace(ranges, 3, 3, 2, [{ type: 'size', value: 16 }]);
  expect(next).toHaveLength(1);
  expect(next[0]).toMatchObject({ type: 'size', value: 16, start: 0, end: 8 });
});

test('clearing formatting in a selection keeps styles outside it', () => {
  const result = clearRangeFormatting([{ start: 0, end: 10, type: 'bold' }, { start: 0, end: 10, type: 'highlight', value: '#ffff00' }], 2, 8);
  expect(result.filter(r => r.type === 'bold').map(r => [r.start, r.end])).toEqual([[0, 2], [8, 10]]);
  expect(result.filter(r => r.type === 'highlight')).toHaveLength(2);
});

test('comment highlighting does not alter editable text runs or offsets', () => {
  const runs = getTextRuns('abcdef', [], 0, [{ start: 2, end: 4, text: 'note' }]);
  expect(runs.map(r => [r.text, r.commented])).toEqual([['ab', false], ['cd', true], ['ef', false]]);
});

test('annotations expand at internal insertions', () => {
  const comments = transformAnnotationRanges([{ start: 2, end: 7, text: 'note' }], 4, 4, 3);
  expect(comments[0]).toMatchObject({ start: 2, end: 10 });
});

test('adjacent identical attribute spans coalesce', () => {
  expect(normalizeRanges([{ start: 0, end: 4, type: 'font', value: 'Arial' }, { start: 4, end: 6, type: 'font', value: 'Arial' }])).toHaveLength(1);
});
