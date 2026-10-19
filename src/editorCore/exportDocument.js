import { getTextRuns } from './formattingParser';

const escapeHtml = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const safeColor = value => /^#[0-9a-fA-F]{3,8}$/.test(String(value)) ? value : null;
/** HTML export is a best-effort document snapshot, not a full fidelity DOCX renderer. */
export function documentToHTML(doc) {
  let start = 0;
  const body = doc.text.split('\n').map((line, i) => {
    const text = getTextRuns(line, doc.formats || [], start).map(run => {
      const attr = run.attributes || {};
      const declarations = [
        run.marks.includes('bold') ? 'font-weight:bold' : '',
        run.marks.includes('italic') ? 'font-style:italic' : '',
        run.marks.includes('underline') ? 'text-decoration:underline' : '',
        run.marks.includes('strike') ? 'text-decoration:line-through' : '',
        safeColor(attr.color) ? `color:${attr.color}` : '',
        safeColor(attr.highlight) ? `background-color:${attr.highlight}` : '',
        Number.isFinite(Number(attr.size)) ? `font-size:${Number(attr.size)}pt` : '',
        attr.script === 'super' ? 'vertical-align:super;font-size:0.72em' : attr.script === 'sub' ? 'vertical-align:sub;font-size:0.72em' : '',
      ].filter(Boolean).join(';');
      let content = escapeHtml(run.text);
      if (attr.link && /^(https?:\/\/|mailto:)/i.test(attr.link)) content = `<a href="${escapeHtml(attr.link)}">${content}</a>`;
      return declarations ? `<span style="${declarations}">${content}</span>` : content;
    }).join('') || '<br>';
    const p = doc.paragraphs?.[i];
    start += line.length + 1;
    const kind = ['title', 'subtitle', 'h1', 'h2', 'h3'].includes(p?.style) ? p.style : 'normal';
    const tag = ({ title: 'h1', h1: 'h1', h2: 'h2', h3: 'h3' })[kind] || 'p';
    const css = { title: 'font-size:27pt;font-weight:650', subtitle: 'font-size:16pt;color:#778592',
      h1: 'font-size:21pt;font-weight:650', h2: 'font-size:17pt;font-weight:650', h3: 'font-size:14pt;font-weight:650' }[kind] || '';
    return `<${tag} data-nexa-style="${kind}" style="text-align:${p?.align || 'left'};line-height:${p?.spacing || 1.5};${css};${p?.pageBreakBefore?'break-before:page;':''}${p?.borderBottom?'border-bottom:1px solid #a4b6c2;':''}margin-top:${Number(p?.spaceBefore)||0}px;margin-bottom:${Number(p?.spaceAfter)||0}px">${text}</${tag}>`;
  }).join('\n');
  const embeds = (doc.embeds || []).map(e => e.type === 'image' ? `<figure><img src="${escapeHtml(e.src)}" alt="${escapeHtml(e.alt || '')}" style="max-width:100%"></figure>`
    : e.type === 'table' ? `<table border="1">${(e.rows||[]).map(row=>`<tr>${row.map(cell=>`<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</table>`
    : e.type === 'chart' ? `<section><h3>${escapeHtml(e.title||'Chart')}</h3><ul>${(e.points||[]).map(pt=>`<li>${escapeHtml(pt.label)}: ${Number(pt.value)}</li>`).join('')}</ul></section>` : '').join('');
  const page = doc.pageSettings || {};
  const header = page.headerText ? `<header>${escapeHtml(page.headerText)}</header>` : '';
  const footer = page.footerText ? `<footer>${escapeHtml(page.footerText)}</footer>` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(doc.title)}</title><style>@page{margin:1in} body{font-family:Arial,sans-serif;max-width:8.5in;margin:auto}p{overflow-wrap:anywhere}table{border-collapse:collapse}td{padding:6px}</style></head><body>${header}${body}${embeds}${footer}</body></html>`;
}

export function saveBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename.replace(/[\\/:*?"<>|]/g, '-');
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
