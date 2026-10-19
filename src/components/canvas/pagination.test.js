import { documentLines, paginateLines } from './pagination';

function reassemble(pages, text) {
  const parts = pages.flatMap(page => page.fragments);
  return parts.map((part, index) =>
    `${index > 0 && parts[index - 1].lineIndex !== part.lineIndex ? '\n' : ''}${text.slice(part.start, part.end)}`
  ).join('');
}

test('splits lengthy paragraphs across multiple pages without changing text offsets', () => {
  const text = 'Nexa Docs '.repeat(240);
  const pages = paginateLines(text, 140, part => Math.max(20, Math.ceil((part.end - part.start) / 36) * 20));
  expect(pages.length).toBeGreaterThan(1);
  expect(reassemble(pages, text)).toBe(text);
  expect(pages[1].fragments[0].continued).toBe(true);
});

test('keeps logical newlines and formatting offsets independent from page boundaries', () => {
  const text = 'Heading\n' + 'paragraph '.repeat(110) + '\nFinal paragraph\n';
  const pages = paginateLines(text, 125, part => Math.max(22, Math.ceil((part.end - part.start) / 36) * 24));
  expect(reassemble(pages, text)).toBe(text);
  expect(documentLines(text).length).toBe(4);
  const first = pages.flatMap(page => page.fragments).find(part => part.lineIndex === 1);
  expect(first.start).toBe(text.indexOf('paragraph'));
});

test('does not split UTF-16 surrogate pairs while generating page fragments', () => {
  const text = '🌍'.repeat(100);
  const pages = paginateLines(text, 60, part => Math.ceil((part.end - part.start) / 12) * 22);
  expect(reassemble(pages, text)).toBe(text);
  pages.flatMap(page => page.fragments).forEach(part => {
    expect(text.slice(part.start, part.end).includes('\uFFFD')).toBe(false);
    expect(part.end % 2).toBe(0);
  });
});
