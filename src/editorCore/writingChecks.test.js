import { inspectWriting, compareLines } from './writingChecks';
test('local writing checks never modify original text', () => {
  const text='I I have  space before , punctuation.';
  expect(inspectWriting(text).map(i=>i.message)).toEqual(expect.arrayContaining(['Repeated word','Multiple consecutive spaces','Unexpected space before punctuation']));
  expect(text).toContain('have  space');
});
test('comparison reports concrete differences', () => {
  expect(compareLines('a\nb', 'a\nc').changes).toEqual([{line:2,current:'b',incoming:'c'}]);
});
