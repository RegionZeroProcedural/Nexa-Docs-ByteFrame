import { getTextRuns } from './formattingParser';
import { normalizeRanges, FORMAT_TYPES } from './editRanges';

export const NEXA_CLIPBOARD_TYPE = 'application/x-nexa-docs-fragment+json';
const escapeHtml = v => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const color = value => typeof value === 'string' && /^(#[0-9a-fA-F]{3,8}|rgba?\([0-9.,\s%]+\)|[a-zA-Z]{2,20})$/.test(value.trim()) ? value.trim() : null;
const font = value => typeof value === 'string' && /^[\w\s,'"-]{1,100}$/.test(value) ? value : null;
const safeLink = value => /^(https?:\/\/|mailto:)/i.test(String(value)) ? String(value) : null;
const PARAGRAPH_TAG = { title: 'h1', subtitle: 'p', h1: 'h1', h2: 'h2', h3: 'h3' };
const PARAGRAPH_CSS = {
  title: 'font-size:27pt;font-weight:650',
  subtitle: 'font-size:16pt;color:#778592',
  h1: 'font-size:21pt;font-weight:650',
  h2: 'font-size:17pt;font-weight:650',
  h3: 'font-size:14pt;font-weight:650',
};

/** A clipboard fragment stores marks once per range, never on each character. */
export function fragmentFromDocument(doc, start, end) {
  const from = Math.max(0, Math.min(doc.text.length, start));
  const to = Math.max(from, Math.min(doc.text.length, end));
  const firstParagraph = doc.text.slice(0, from).split('\n').length - 1;
  const count = doc.text.slice(from, to).split('\n').length;
  return {
    version: 1,
    text: doc.text.slice(from, to),
    formats: (doc.formats || []).filter(r => r.end > from && r.start < to)
      .map(({ type, value, start: s, end: e }) => ({ type, ...(value !== undefined ? { value } : {}), start: Math.max(s, from) - from, end: Math.min(e, to) - from })),
    paragraphs: (doc.paragraphs || []).slice(firstParagraph, firstParagraph + count).map(p => ({ ...p })),
  };
}

export function normalizeFragment(fragment) {
  if (!fragment || typeof fragment.text !== 'string' || fragment.text.length > 5_000_000) return null;
  const end = fragment.text.length;
  return {
    version: 1,
    text: fragment.text.replace(/\r\n?/g, '\n'),
    formats: normalizeRanges((Array.isArray(fragment.formats) ? fragment.formats : []).filter(r =>
      r && FORMAT_TYPES.includes(r.type) && Number.isInteger(r.start) && Number.isInteger(r.end))
      .map(r => ({ type: r.type, ...(r.value !== undefined ? { value: r.value } : {}),
        start: Math.min(end, Math.max(0, r.start)), end: Math.min(end, Math.max(0, r.end)) }))),
    paragraphs: Array.isArray(fragment.paragraphs) ? fragment.paragraphs.slice(0, 5000) : [],
  };
}

export function fragmentToHTML(fragment) {
  const lines = fragment.text.split('\n');
  let absolute = 0;
  const html = lines.map((line, i) => {
    const formatted = getTextRuns(line, fragment.formats || [], absolute).map(run => {
      const a = run.attributes || {};
      const style = [
        run.marks.includes('bold') ? 'font-weight:bold' : '',
        run.marks.includes('italic') ? 'font-style:italic' : '',
        run.marks.includes('underline') ? 'text-decoration:underline' : '',
        run.marks.includes('strike') ? 'text-decoration:line-through' : '',
        color(a.color) ? `color:${color(a.color)}` : '',
        color(a.highlight) ? `background-color:${color(a.highlight)}` : '',
        font(a.font) ? `font-family:${font(a.font)}` : '',
        Number(a.size) >= 6 && Number(a.size) <= 96 ? `font-size:${Number(a.size)}pt` : '',
      ].filter(Boolean).join(';');
      let content = escapeHtml(run.text);
      if (safeLink(a.link)) content = `<a href="${escapeHtml(a.link)}">${content}</a>`;
      return style ? `<span style="${escapeHtml(style)}">${content}</span>` : content;
    }).join('');
    absolute += line.length + 1;
    const paragraph = fragment.paragraphs?.[i] || {};
    const align = paragraph.align;
    const type = PARAGRAPH_TAG[paragraph.style] ? paragraph.style : 'normal';
    const tag = PARAGRAPH_TAG[type] || 'p';
    const safeAlign = ['left', 'center', 'right', 'justify'].includes(align) ? `text-align:${align}` : '';
    const css = [PARAGRAPH_CSS[type], safeAlign].filter(Boolean).join(';');
    return `<${tag} data-nexa-style="${type}"${css ? ` style="${css}"` : ''}>${formatted || '<br>'}</${tag}>`;
  }).join('');
  return `<div data-nexa-docs-fragment="1">${html}</div>`;
}

/** Decode common HTML styling from external applications into Nexa mark ranges.
 * HTML is parsed as inert data: no tags, handlers, or external resources are inserted. */
export function fragmentFromHTML(html) {
  if (!html || typeof DOMParser === 'undefined') return null;
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const result = { version: 1, text: '', formats: [], paragraphs: [] };
  const push = (value, marks) => {
    if (!value || result.text.length > 5_000_000) return;
    const start = result.text.length;
    result.text += value.replace(/\r\n?/g, '\n');
    for (const mark of marks) result.formats.push({ ...mark, start, end: result.text.length });
  };
  const blockTags = new Set(['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'BLOCKQUOTE', 'PRE', 'TR']);
  const disallowed = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'HEAD', 'META', 'LINK', 'SVG']);
  const walk = (node, inherited = []) => {
    if (node.nodeType === 3) { push(node.nodeValue || '', inherited); return; }
    if (node.nodeType !== 1 || disallowed.has(node.tagName)) return;
    if (node.tagName === 'BR') { push('\n', []); return; }
    const block = blockTags.has(node.tagName);
    if (block && result.text && !result.text.endsWith('\n')) push('\n', []);
    if (block) {
      const index = result.text.split('\n').length - 1;
      const align = node.style?.textAlign;
      const declared = node.getAttribute('data-nexa-style');
      const tagStyle = ({ H1: 'h1', H2: 'h2', H3: 'h3' })[node.tagName];
      const style = PARAGRAPH_TAG[declared] ? declared : tagStyle;
      result.paragraphs[index] = {
        ...(result.paragraphs[index] || {}),
        ...(style ? { style } : {}),
        ...(['left', 'center', 'right', 'justify'].includes(align) ? { align } : {}),
      };
    }
    const map = new Map(inherited.map(m => [m.type, m]));
    const tag = node.tagName;
    if (['B', 'STRONG'].includes(tag)) map.set('bold', { type: 'bold' });
    if (['EM', 'I'].includes(tag)) map.set('italic', { type: 'italic' });
    if (tag === 'U') map.set('underline', { type: 'underline' });
    if (['DEL', 'S', 'STRIKE'].includes(tag)) map.set('strike', { type: 'strike' });
    if (tag === 'A' && safeLink(node.getAttribute('href'))) map.set('link', { type: 'link', value: node.getAttribute('href') });
    const css = node.style;
    const weight = css?.fontWeight;
    if (weight === 'bold' || (Number(weight) >= 600)) map.set('bold', { type: 'bold' });
    if (weight === 'normal' || (weight && Number(weight) < 600)) map.delete('bold');
    if (css?.fontStyle === 'italic' || css?.fontStyle === 'oblique') map.set('italic', { type: 'italic' });
    else if (css?.fontStyle === 'normal') map.delete('italic');
    if (css?.textDecorationLine?.includes('underline') || css?.textDecoration?.includes('underline')) map.set('underline', { type: 'underline' });
    if (css?.textDecorationLine?.includes('line-through') || css?.textDecoration?.includes('line-through')) map.set('strike', { type: 'strike' });
    for (const [type, value] of [['color', css?.color || node.getAttribute('color')], ['highlight', css?.backgroundColor]]) {
      if (value && color(value)) map.set(type, { type, value: color(value) });
    }
    const family = css?.fontFamily || (tag === 'FONT' ? node.getAttribute('face') : '');
    if (family && font(family)) map.set('font', { type: 'font', value: font(family) });
    const match = css?.fontSize?.match(/^(\d+(?:\.\d+)?)(pt|px)$/i);
    if (match) {
      const size = Number(match[1]) * (match[2].toLowerCase() === 'px' ? .75 : 1);
      if (size >= 6 && size <= 96) map.set('size', { type: 'size', value: Math.round(size * 100) / 100 });
    }
    for (const child of node.childNodes) walk(child, [...map.values()]);
    if (block && !result.text.endsWith('\n')) push('\n', []);
  };
  for (const child of parsed.body.childNodes) walk(child);
  if (result.text.endsWith('\n')) result.text = result.text.slice(0, -1);
  // HTML paragraph boundaries may have generated a trailing mark on a removed newline.
  result.formats = result.formats.map(r => ({ ...r, end: Math.min(r.end, result.text.length) }));
  return normalizeFragment(result);
}

export function fragmentFromClipboardData(clipboard, plainOnly = false) {
  const text = clipboard?.getData('text/plain') || '';
  if (plainOnly) return { version: 1, text, formats: [], paragraphs: [] };
  const internal = clipboard?.getData(NEXA_CLIPBOARD_TYPE);
  if (internal) { try { const parsed = normalizeFragment(JSON.parse(internal)); if (parsed) return parsed; } catch { /* fall back to HTML */ } }
  const html = clipboard?.getData('text/html');
  if (html) {
    const fragment = fragmentFromHTML(html);
    if (fragment && (fragment.text || !text)) return fragment;
  }
  return { version: 1, text, formats: [], paragraphs: [] };
}
