import {
  fragmentFromDocument, fragmentToHTML, fragmentFromHTML,
  fragmentFromClipboardData, NEXA_CLIPBOARD_TYPE,
} from './richClipboard';

test('a formatted selection is copied using relative range offsets', () => {
  const document = {
    text: 'zero BOLD last', paragraphs: [{ align: 'left' }],
    formats: [{ type: 'bold', start: 5, end: 9 }, { type: 'color', value: '#ee0033', start: 5, end: 14 }],
  };
  const fragment = fragmentFromDocument(document, 5, 9);
  expect(fragment.text).toBe('BOLD');
  expect(fragment.formats).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: 'bold', start: 0, end: 4 }),
    expect.objectContaining({ type: 'color', start: 0, end: 4 }),
  ]));
});

test('Nexa HTML clipboard roundtrip retains bold, italic, colors and Unicode', () => {
  const document = { text: 'Hi 🌍!\nA title', paragraphs: [{ align: 'center' }, { align: 'left' }], formats: [
    { type: 'bold', start: 0, end: 6 }, { type: 'italic', start: 7, end: 14 },
    { type: 'color', value: '#8822bb', start: 3, end: 6 },
  ] };
  const source = fragmentFromDocument(document, 0, document.text.length);
  const parsed = fragmentFromHTML(fragmentToHTML(source));
  expect(parsed.text).toBe(document.text);
  expect(parsed.formats).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: 'bold', start: 0, end: 6 }),
    expect.objectContaining({ type: 'italic', start: 7, end: 14 }),
  ]));
});

test('internal clipboard MIME preserves exact formatting, paste-without-formatting does not', () => {
  const data = { version: 1, text: 'BOLD', formats: [{ type: 'bold', start: 0, end: 4 }] };
  const clipboard = { getData: type => ({
    [NEXA_CLIPBOARD_TYPE]: JSON.stringify(data), 'text/plain': 'BOLD',
  })[type] || '' };
  expect(fragmentFromClipboardData(clipboard).formats).toHaveLength(1);
  expect(fragmentFromClipboardData(clipboard, true).formats).toHaveLength(0);
});

test('external HTML is converted to ranges and script elements are ignored', () => {
  const parsed = fragmentFromHTML('<script>alert(1)</script><p><b>Bold</b> and <i>italic</i></p>');
  expect(parsed.text).toBe('Bold and italic');
  expect(parsed.formats).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: 'bold', start: 0, end: 4 }),
    expect.objectContaining({ type: 'italic', start: 9, end: 15 }),
  ]));
});

test('copy and paste preserve paragraph style metadata for titles and heading levels', () => {
  for (const style of ['title', 'subtitle', 'h1', 'h2', 'h3']) {
    const original = { text: `Example ${style}`, formats: [], paragraphs: [{ style, align: 'left', spacing: 1.5 }] };
    const copied = fragmentFromDocument(original, 0, original.text.length);
    const html = fragmentToHTML(copied);
    const restored = fragmentFromHTML(html);
    expect(restored.text).toBe(original.text);
    expect(restored.paragraphs[0].style).toBe(style);
  }
});

test('pasting semantic HTML headings imports the correct paragraph style', () => {
  const text = fragmentFromHTML('<h1>Alpha</h1><h2>Beta</h2><h3>Gamma</h3>');
  expect(text.text).toBe('Alpha\nBeta\nGamma');
  expect(text.paragraphs.map(p => p?.style)).toEqual(['h1', 'h2', 'h3']);
});
