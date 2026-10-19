import React, { useEffect, useMemo, useRef, useState } from 'react';
import { inspectWriting, compareLines } from '../../editorCore/writingChecks';

function DrawingPad({ onAdd, onClose, notice }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const point = event => {
    const rect = canvasRef.current.getBoundingClientRect();
    return [(event.clientX - rect.left) * 600 / rect.width, (event.clientY - rect.top) * 260 / rect.height];
  };
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,600,260);
    ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.strokeStyle = '#164968';
  }, []);
  const save = () => {
    const src = canvasRef.current.toDataURL('image/png');
    if (src.length >= 1450000) { notice('Drawing is too large for browser-local storage.'); return; }
    onAdd({ type: 'image', src, alt: 'Nexa Docs drawing', width: 100 }); onClose();
  };
  return <section className="nexa-feature-form"><p>Draw on the canvas. The drawing is stored locally as an image attachment.</p>
    <canvas ref={canvasRef} width={600} height={260} className="nexa-drawing-canvas" aria-label="Drawing surface"
      onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); drawingRef.current = true; const [x,y]=point(e); canvasRef.current.getContext('2d').beginPath(); canvasRef.current.getContext('2d').moveTo(x,y); }}
      onPointerMove={e=>{ if(!drawingRef.current)return; const [x,y]=point(e); const ctx=canvasRef.current.getContext('2d');ctx.lineTo(x,y);ctx.stroke(); }}
      onPointerUp={()=>drawingRef.current=false} onPointerCancel={()=>drawingRef.current=false} />
    <div className="dialog-button-row"><button type="button" onClick={()=>{const c=canvasRef.current.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,600,260);}}>Clear drawing</button>
      <button type="button" className="nexa-primary" onClick={save}>Insert drawing</button></div></section>;
}
export default function FeatureDialogs({ mode, editor, view, onClose, setNotice }) {
  const [tableRows, setTableRows] = useState('Column A\tColumn B\nValue A\tValue B');
  const [chartData, setChartData] = useState('Category,Value\nFirst,12\nSecond,18\nThird,9');
  const [chartName, setChartName] = useState('Data chart');
  const [signature, setSignature] = useState('');
  const [headerText, setHeaderText] = useState(editor.doc.pageSettings?.headerText || '');
  const [footerText, setFooterText] = useState(editor.doc.pageSettings?.footerText || '');
  const [showPageNumbers, setShowPageNumbers] = useState(!!editor.doc.pageSettings?.showPageNumbers);
  const [replacement, setReplacement] = useState('');
  const [fileDiff, setFileDiff] = useState(null);
  const [citation, setCitation] = useState({ title:'', author:'', year:'', url:'' });
  const [selectedEmbed, setSelectedEmbed] = useState('');
  const [embedValue, setEmbedValue] = useState('striped');
  const [notify, setNotify] = useState(() => localStorage.getItem('nexa-docs:notify-save') === 'true');
  const writing = useMemo(() => mode === 'grammar' ? inspectWriting(editor.doc.text) : [], [mode, editor.doc.text]);
  const source = editor.doc.text;
  const mutable = editor.editMode === 'editing' && !view.binaryFile;
  const blockItems = editor.doc.embeds || [];
  if (mode === 'templates') return <section className="nexa-feature-form"><p>Start a new local document with a prepared outline. Save your current work first; your existing draft is replaced.</p>
    {[['Meeting notes','Meeting notes\nDate: \nAttendees: \nAgenda: \nDecisions: \nActions: '],['Project proposal','Project proposal\nSummary\n\nScope\n\nMilestones\n\nRisks\n'],['Technical report','Technical report\nOverview\n\nArchitecture\n\nFindings\n\nConclusions\n']].map(([label,body]) => <button type="button" key={label} onClick={()=>{
      if (editor.newFromTemplate(label, body)) onClose();
    }}>{label}</button>)}
  </section>;
  if (mode === 'table') return <section className="nexa-feature-form">
    <p>Enter tab-separated cells, one row per line. The first row becomes the header. Tables are currently placed on a separate document page.</p>
    <label>Table cells<textarea rows="6" value={tableRows} onChange={e => setTableRows(e.target.value)} /></label>
    <button type="button" className="nexa-primary" onClick={() => {
      const rows=tableRows.split('\n').slice(0,30).map(line=>line.split('\t').slice(0,12).map(cell=>cell.slice(0,600)));
      if (!rows.length || !rows[0].length) { setNotice('Enter at least one cell.'); return; }
      editor.addEmbed({type:'table',rows,theme:'minimal',title:'Table'}); onClose();
    }}>Insert table</button>
  </section>;
  if (mode === 'chart') return <section className="nexa-feature-form">
    <p>Create a local bar chart from comma-separated labels and numeric values. The chart is a separate document block.</p>
    <label>Chart name<input value={chartName} onChange={e=>setChartName(e.target.value)} maxLength={100} /></label>
    <label>Values (label,number per row)<textarea rows="6" value={chartData} onChange={e=>setChartData(e.target.value)} /></label>
    <button type="button" className="nexa-primary" onClick={()=>{
      const points=chartData.split('\n').slice(0,30).map(row=>{const i=row.lastIndexOf(',');return {label:row.slice(0,i).trim().slice(0,90),value:Number(row.slice(i+1))};}).filter(p=>p.label && Number.isFinite(p.value));
      if(!points.length){setNotice('Provide one or more rows in label,number form.');return;}
      editor.addEmbed({type:'chart',title:chartName.trim() || 'Chart',points});onClose();
    }}>Insert chart</button>
  </section>;
  if (mode === 'drawing') return <DrawingPad onAdd={editor.addEmbed} onClose={onClose} notice={setNotice} />;
  if (mode === 'signature') return <section className="nexa-feature-form"><p><strong>Visual only.</strong> This is not an electronic-signature service and does not verify identity or record consent.</p>
    <label>Display name<input value={signature} onChange={e=>setSignature(e.target.value)} maxLength={90} /></label>
    <button className="nexa-primary" type="button" disabled={!signature.trim()} onClick={()=>{editor.insertAtSelection(`\nSigned: ${signature.trim()}\nDate: ${new Date().toLocaleDateString()}\n(Visual signature — unverified)\n`);onClose();}}>Insert visual signature</button></section>;
  if (mode === 'headers') return <section className="nexa-feature-form">
    <p>Headers, footers, and optional page numbers repeat on each printed document page.</p>
    <label>Header text<input maxLength={160} value={headerText} onChange={e=>setHeaderText(e.target.value)} /></label>
    <label>Footer text<input maxLength={160} value={footerText} onChange={e=>setFooterText(e.target.value)} /></label>
    <label className="nexa-check"><input type="checkbox" checked={showPageNumbers} onChange={e=>setShowPageNumbers(e.target.checked)} /> Show page numbers</label>
    <button className="nexa-primary" type="button" onClick={()=>{editor.updatePage({headerText,footerText,showPageNumbers});view.setPrintLayout(true);onClose();}}>Apply</button>
  </section>;
  if (mode === 'imageStyle' || mode === 'tableStyle') {
    const items=blockItems.filter(b=>b.type === (mode==='imageStyle'?'image':'table'));
    const target=items.find(e=>e.id===selectedEmbed) || items[0];
    return <section className="nexa-feature-form"><p>Modify a document {mode==='imageStyle'?'image':'table'} attachment.</p>
      {items.length ? <><label>Object<select value={target?.id || ''} onChange={e=>setSelectedEmbed(e.target.value)}>{items.map((e,i)=><option key={e.id} value={e.id}>{e.alt || `${e.type} ${i+1}`}</option>)}</select></label>
        {mode==='imageStyle' ? <label>Width (20–100%)<input type="number" min="20" max="100" value={embedValue==='striped'?100:embedValue} onChange={e=>setEmbedValue(e.target.value)} /></label>
          : <label>Table style<select value={embedValue} onChange={e=>setEmbedValue(e.target.value)}><option value="minimal">Minimal</option><option value="striped">Striped rows</option><option value="bordered">Strong borders</option></select></label>}
        <button className="nexa-primary" onClick={()=>{if(mode==='imageStyle')editor.updateEmbed(target.id,{width:Math.min(100,Math.max(20,Number(embedValue)||100))});else editor.updateEmbed(target.id,{theme:embedValue});onClose();}}>Apply style</button>
      </> : <p>No {mode==='imageStyle'?'images':'tables'} exist. Insert one first.</p>}
    </section>;
  }
  if (mode === 'grammar') return <section className="nexa-feature-form"><p>Local, rule-based writing checks. Not a full grammar service. Findings are generated on your device.</p>
    {writing.length ? writing.map((issue,i)=><div className="nexa-feature-row" key={i}><div><strong>{issue.message}</strong><small>Character {issue.start+1} · {source.slice(issue.start,issue.end)}</small></div><button disabled={!mutable || source.slice(issue.start,issue.end) === issue.replacement} onClick={()=>{
      if(editor.doc.text.slice(issue.start,issue.end)!==source.slice(issue.start,issue.end)){setNotice('Text changed. Reopen the checker.');return;}
      editor.replaceText(issue.start,issue.end,issue.replacement,'edit');setNotice('Correction applied.');}}>Fix</button></div>) : <p>No issues found by these basic rules.</p>}
  </section>;
  if (mode === 'compare') return <section className="nexa-feature-form"><p>Compare your current document with a local UTF-8 text file. No file is uploaded; this is a bounded line-by-line comparison, not a semantic diff.</p>
    <input type="file" accept=".txt,.md,.csv,.json,.js,.jsx,.ts,.py,.log,.html,.css,text/plain" onChange={async e=>{
      const f=e.target.files?.[0]; if(!f)return;
      if(f.size>1024*1024){setNotice('Choose a text file smaller than 1 MB.');return;}
      const txt=await f.text();setFileDiff({name:f.name,...compareLines(editor.doc.text,txt)});
    }} />
    {fileDiff && <><h3>{fileDiff.name}</h3><p>{fileDiff.changes.length} displayed differing line(s){fileDiff.truncated?' (limit reached)':''}.</p>
      <div className="nexa-diff-list">{fileDiff.changes.map(change=><div key={change.line}><b>Line {change.line}</b><del>{change.current}</del><ins>{change.incoming}</ins></div>)}</div></>}
  </section>;
  if (mode === 'suggestions') return <section className="nexa-feature-form"><p>Propose a change to selected text, then accept or reject it. Proposed changes do not alter the document until accepted.</p>
    <label>Replacement text<textarea value={replacement} onChange={e=>setReplacement(e.target.value)} rows="3" /></label>
    <button type="button" disabled={!mutable || editor.selection.start===editor.selection.end} onClick={()=>{editor.suggestReplacement(replacement);setReplacement('');setNotice('Suggestion staged for review.');}}>Suggest replacement for selection</button>
    <h3>Pending suggestions</h3>{(editor.doc.suggestions || []).length ? editor.doc.suggestions.map(s=><div className="nexa-feature-row" key={s.id}><div><strong>{s.before} → {s.replacement}</strong><small>Characters {s.start}–{s.end}</small></div><button onClick={()=>editor.resolveSuggestion(s.id,true)} disabled={!mutable}>Accept</button><button onClick={()=>editor.resolveSuggestion(s.id,false)}>Reject</button></div>) : <p>No pending suggestions.</p>}
  </section>;
  if (mode === 'citations') return <section className="nexa-feature-form"><p>Simple local citations, not a formal citation-style engine. Sources are included in document backups.</p>
    {['title','author','year','url'].map(k=><label key={k}>{k[0].toUpperCase()+k.slice(1)}<input value={citation[k]} onChange={e=>setCitation(v=>({...v,[k]:e.target.value}))} /></label>)}
    <button type="button" disabled={!mutable || !citation.title.trim()} onClick={()=>{editor.addCitation(citation);setCitation({title:'',author:'',year:'',url:''});setNotice('Citation saved and a reference marker inserted.');}}>Insert citation</button>
    <button type="button" disabled={!mutable || !(editor.doc.citations || []).length} onClick={()=>{editor.insertAtSelection('\nReferences\n'+editor.doc.citations.map((c,i)=>`[${i+1}] ${[c.author,c.title,c.year,c.url].filter(Boolean).join('. ')}`).join('\n'));onClose();}}>Insert bibliography</button>
    {(editor.doc.citations||[]).map((c,i)=><p key={c.id}>[{i+1}] {c.title} — {c.author}</p>)}
  </section>;
  if (mode === 'links') return <section className="nexa-feature-form"><p>Jump to a saved local bookmark. External linked objects are not supported.</p>
    {(editor.doc.bookmarks||[]).length ? editor.doc.bookmarks.map(b=><div key={b.id} className="nexa-feature-row"><strong>{b.label}</strong><button type="button" onClick={()=>{editor.goToOffset(b.offset);onClose();}}>Go to position {b.offset}</button></div>) : <p>No bookmarks yet. Use Insert → Bookmark to create one.</p>}
  </section>;
  if (mode === 'notifications') return <section className="nexa-feature-form"><p>Optional on-screen save notices. This setting never requests push-notification permission.</p>
    <label className="nexa-check"><input type="checkbox" checked={notify} onChange={e=>{setNotify(e.target.checked);localStorage.setItem('nexa-docs:notify-save',String(e.target.checked));window.dispatchEvent(new Event('nexa-notification-setting'));}} /> Show small save confirmation notices</label>
  </section>;
  return null;
}
