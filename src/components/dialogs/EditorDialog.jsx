import React, { useEffect, useMemo, useRef, useState } from 'react';
import FeatureDialogs from './FeatureDialogs';
import { saveBlob } from '../../editorCore/exportDocument';
import { BUILTIN_ADDONS, runBuiltinAddon } from '../../extensions/builtinAddons';
import { POLICY_UPDATED, NEEDS_OPERATOR, PRIVACY, TERMS } from '../../legal/policies';

const SYMBOLS = ['©','®','™','§','¶','•','…','—','–','→','←','↑','↓','↔','✓','✕','∞','≈','≠','≤','≥','±','÷','×','∑','∫','√','π','α','β','γ','Δ','θ','Ω','µ','€','£','¥','°','½','¼','¾','★','♥','☀','☺'];
const EQUATIONS = ['∑','∫','√','π','θ','α','β','∞','≤','≥','≠','≈','±','×','÷','²','³','₁','₂','→','∂','∇','∈','∉'];
const HELP = [
  ['Write', 'Click inside the page and type. Select text to format it using the toolbar or Format menu.'],
  ['Comments', 'Select text, choose Insert → Comment, and use the cards beside the page to resolve or revisit notes.'],
  ['Saving', 'Your draft autosaves to browser storage. File → Download → Nexa document backup preserves formatting and comments.'],
  ['Limitations', 'This is a local editor prototype: no cloud sharing or advanced tables yet.'],
];
export default function EditorDialog({ mode, editor, view, onClose }) {
  const dialogRef = useRef(null);
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [notice, setNotice] = useState('');
  const [name, setName] = useState(editor.doc.title);
  const [page, setPage] = useState(editor.doc.pageSettings || { width: 816, height: 1056, margin: 96 });
  const recognitionRef = useRef(null);
  const recordingRef = useRef(null);
  const [recording, setRecording] = useState(false);
  const [listening, setListening] = useState(false);
  const selected = editor.selectedText();
  const count = useMemo(() => {
    if (!query) return 0;
    const haystack = matchCase ? editor.doc.text : editor.doc.text.toLocaleLowerCase();
    const needle = matchCase ? query : query.toLocaleLowerCase();
    let n = 0;
    for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + needle.length)) n++;
    return n;
  }, [editor.doc.text, query, matchCase]);
  useEffect(() => {
    dialogRef.current?.focus();
    const key = event => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('keydown', key); recognitionRef.current?.stop();
      const active = recordingRef.current;
      if (active?.recorder?.state === 'recording') active.recorder.stop();
      active?.stream?.getTracks().forEach(track => track.stop()); };
  }, [onClose]);
  const insert = value => { editor.insertAtSelection(value); onClose(); };
  const startVoice = () => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) { setNotice('This browser does not provide the SpeechRecognition API.'); return; }
    try {
      const recognition = new Recognition();
      recognition.lang = view.language?.startsWith('Spanish') ? 'es-ES' : view.language?.startsWith('French') ? 'fr-FR' : 'en-US';
      recognition.continuous = true; recognition.interimResults = false;
      recognition.onresult = event => {
        for (let i = event.resultIndex; i < event.results.length; i++) if (event.results[i].isFinal) editor.insertAtSelection(event.results[i][0].transcript + ' ');
      };
      recognition.onerror = event => { setNotice(`Voice typing stopped: ${event.error}`); setListening(false); };
      recognition.onend = () => setListening(false);
      recognitionRef.current = recognition; recognition.start(); setListening(true);
    } catch (err) { setNotice(err.message); }
  };
  const stopRecording = () => {
    const { recorder, stream } = recordingRef.current || {};
    if (recorder?.state === 'recording') recorder.stop();
    stream?.getTracks().forEach(track => track.stop());
    setRecording(false);
  };
  const startRecording = async () => {
    if (!navigator.mediaDevices?.getDisplayMedia || !window.MediaRecorder) {
      setNotice('Screen recording is not supported in this browser or context.'); return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const chunks = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        if (chunks.length) saveBlob(new Blob(chunks, { type: recorder.mimeType || 'video/webm' }),
          `${editor.doc.title.replace(/[\\/:*?"<>|]/g, '-')}-capture.webm`, 'video/webm');
        stream.getTracks().forEach(track => track.stop()); setRecording(false);
      };
      stream.getVideoTracks()[0]?.addEventListener('ended', stopRecording, { once: true });
      recordingRef.current = { recorder, stream };
      recorder.start(1000); setRecording(true); setNotice('Recording locally; press Stop to save a .webm file. No upload occurs.');
    } catch (error) { setNotice(`Could not start recording: ${error.message}`); }
  };
  const titles = {
    find: 'Find and replace', page: 'Page setup', wordcount: 'Word count', rename: 'Rename document',
    library: 'Local snapshots', symbols: 'Special characters', equation: 'Insert equation symbols',
    details: 'Document details', voice: 'Voice typing', record: 'Record screen', help: 'Nexa Docs help', training: 'Quick start',
    updates: 'What’s new', preferences: 'Preferences', accessibility: 'Accessibility', shortcuts: 'Keyboard shortcuts',
    privacy: 'Privacy Policy — preview draft', terms: 'Terms of Service — preview draft',
    addons: 'Nexa Docs extensions', addonsInfo: 'Create Nexa Docs extensions', feedback: 'Report a problem',
    templates: 'Document templates', table: 'Insert table', chart: 'Insert chart', drawing: 'Insert drawing', signature: 'Visual signature',
    headers: 'Headers, footers & page numbers', imageStyle: 'Image formatting', tableStyle: 'Table formatting',
    grammar: 'Local writing checks', compare: 'Compare document', suggestions: 'Suggested edits',
    citations: 'Citations', links: 'Document links', notifications: 'Local save notices',
  };
  const footer = (label, onClick) => <div className="nexa-dialog-footer"><button onClick={onClose}>Cancel</button><button className="nexa-primary" onClick={onClick}>{label}</button></div>;
  return <div className="nexa-dialog-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div ref={dialogRef} className="nexa-dialog" role="dialog" aria-modal="true" aria-label={titles[mode] || 'Nexa dialog'} tabIndex={-1}>
      <div className="nexa-dialog-heading"><h2>{titles[mode] || 'Nexa Docs'}</h2><button type="button" aria-label="Close dialog" onClick={onClose}>×</button></div>
      <div className="nexa-dialog-content">
        {mode === 'find' && <>
          <label>Find<input autoFocus value={query} onChange={e => { setQuery(e.target.value); setNotice(''); }} onKeyDown={e => { if (e.key === 'Enter') { const found = editor.findText(query, matchCase); setNotice(found ? 'Selected next match.' : 'Nothing found.'); } }} /></label>
          <label>Replace with<input value={replacement} onChange={e => setReplacement(e.target.value)} /></label>
          <label className="nexa-check"><input type="checkbox" checked={matchCase} onChange={e => setMatchCase(e.target.checked)} /> Match case</label>
          <small>{query ? `${count} match${count === 1 ? '' : 'es'} in document` : 'Enter text to search.'}</small>
          <div className="dialog-button-row">
            <button onClick={() => setNotice(editor.findText(query, matchCase) ? 'Match selected.' : 'No match found.')} disabled={!query}>Find next</button>
            <button onClick={() => setNotice(`${editor.replaceMatches(query, replacement, false, matchCase)} replaced.`)} disabled={!query || !count}>Replace next</button>
            <button onClick={() => setNotice(`${editor.replaceMatches(query, replacement, true, matchCase)} matches replaced.`)} disabled={!query || !count}>Replace all</button>
          </div>
        </>}
        {mode === 'rename' && <><label>Document title<input autoFocus maxLength="120" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { editor.updateTitle(name || 'Untitled document'); onClose(); } }} /></label>{footer('Rename', () => { editor.updateTitle(name || 'Untitled document'); onClose(); })}</>}
        {mode === 'page' && <>
          <label>Paper size<select value={page.width === 794 || page.width === 1123 ? 'a4' : 'letter'} onChange={e => {
            const portrait = page.width <= page.height;
            const [w, h] = e.target.value === 'a4' ? [794, 1123] : [816, 1056];
            setPage({ ...page, width: portrait ? w : h, height: portrait ? h : w });
          }}><option value="letter">US Letter</option><option value="a4">A4</option></select></label>
          <label>Orientation<select value={page.width > page.height ? 'landscape' : 'portrait'} onChange={e => setPage({ ...page, width: e.target.value === 'portrait' ? Math.min(page.width, page.height) : Math.max(page.width, page.height), height: e.target.value === 'portrait' ? Math.max(page.width, page.height) : Math.min(page.width, page.height) })}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>
          <label>Page margins<select value={page.margin} onChange={e => setPage({ ...page, margin: Number(e.target.value) })}>{[48,72,90,100,120].map(n => <option key={n} value={n}>{n} px</option>)}</select></label>
          <small>Page setup updates the local document. Visual page splitting is available; complex inline elements can still paginate imperfectly.</small>
          {footer('Apply page setup', () => { editor.updatePage(page); view.setPrintLayout(true); onClose(); })}
        </>}
        {mode === 'wordcount' && <div className="stat-grid">
          {[['Words', editor.wordCount], ['Characters', editor.doc.text.length], ['Characters without spaces', editor.doc.text.replace(/\s/g, '').length], ['Paragraphs', editor.doc.text.split('\n').length], ['Selected words', selected.trim() ? selected.trim().split(/\s+/u).length : 0]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value.toLocaleString()}</strong></div>)}
        </div>}
        {mode === 'library' && <><p>Snapshots are saved in this browser only. Export a backup for portable storage.</p>
          <button onClick={() => { if (editor.saveSnapshot()) setNotice('Snapshot saved. Close and reopen this panel to refresh.'); }}>Save current snapshot</button>
          <div className="snapshot-list">{editor.listSnapshots().length ? editor.listSnapshots().map((snapshot, index) => <button key={snapshot.id + index} onClick={() => { editor.openSnapshot(snapshot); onClose(); }}><strong>{snapshot.title}</strong><small>{new Date(snapshot.savedAt || snapshot.updatedAt).toLocaleString()}</small></button>) : <span>No local snapshots yet.</span>}</div>
        </>}
        {(mode === 'symbols' || mode === 'equation') && <><p>Choose a symbol to insert at the cursor position.</p><div className="symbol-grid">{(mode === 'symbols' ? SYMBOLS : EQUATIONS).map(symbol => <button type="button" key={symbol} aria-label={`Insert ${symbol}`} onClick={() => insert(symbol)}>{symbol}</button>)}</div></>}
        {mode === 'details' && <div className="stat-grid">{[['Title', editor.doc.title], ['Edited', new Date(editor.doc.updatedAt).toLocaleString()], ['Comments', editor.doc.comments?.length || 0], ['Format', 'Local Nexa draft'], ['Storage', 'Browser localStorage']].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>}
        {mode === 'record' && <><p>Record a screen or browser tab with your permission. The resulting WebM video is saved directly to your device, not uploaded to Nexa Docs.</p>
          <div className="dialog-button-row"><button className={recording ? 'voice-live' : ''} onClick={() => recording ? stopRecording() : startRecording()}>{recording ? '● Stop & save recording' : '◉ Select screen to record'}</button></div>
          <small>Recording availability and video encoding depend on your browser. Close this dialog to stop recording.</small></>}
        {mode === 'voice' && <><p>Dictate text using your browser's built-in speech recognition. Microphone permission is required; recognition may use your browser vendor's service.</p>
          <div className="dialog-button-row"><button className={listening ? 'voice-live' : ''} onClick={() => listening ? recognitionRef.current?.stop() : startVoice()}>{listening ? '● Stop listening' : '🎙 Start voice typing'}</button></div>
          <small>Voice dictation is experimental and browser-dependent. Review the transcription before saving.</small></>}
        {(mode === 'help' || mode === 'training') && <div className="guide-list">{HELP.map(([title, detail]) => <div key={title}><h3>{title}</h3><p>{detail}</p></div>)}</div>}
        {mode === 'updates' && <div className="guide-list"><h3>Local editing and ByteFrame</h3><p>Nexa Docs supports range-based formatting, document pages, local backups, binary viewing and staged hexadecimal byte edits.</p><h3>Still planned</h3><p>Cloud collaboration, fully embedded tables and media, and third-party extension hosting are not available.</p></div>}
        {(mode === 'privacy' || mode === 'terms') && <div className="nexa-legal-notice">
          <p className="legal-draft-warning"><strong>Preview draft — not final legal advice.</strong> {NEEDS_OPERATOR}</p>
          <p className="legal-updated">Last updated: {POLICY_UPDATED}</p>
          {(mode === 'privacy' ? PRIVACY : TERMS).map(([heading, description]) =>
            <section key={heading}><h3>{heading}</h3><p>{description}</p></section>)}
          <div className="dialog-button-row"><button type="button" onClick={() => {
            const lines = (mode === 'privacy' ? PRIVACY : TERMS).map(([a,b]) => `${a}\n${b}`).join('\n\n');
            saveBlob(`${mode === 'privacy' ? 'Nexa Docs Privacy Policy' : 'Nexa Docs Terms of Service'}\n${POLICY_UPDATED}\n\n${lines}`,
              `nexa-docs-${mode}-preview.txt`, 'text/plain;charset=utf-8');
          }}>Download this draft</button></div>
        </div>}
        {mode === 'addons' && <div className="nexa-addons-dialog">
          <p>These first-party text utilities run entirely in your current browser session. They are built into Nexa Docs; no remote third-party code is installed.</p>
          {BUILTIN_ADDONS.map(addon => <div className="nexa-addon-row" key={addon.id}>
            <div><strong>{addon.label}</strong><small>{addon.description}</small></div>
            <button type="button" disabled={editor.editMode !== 'editing' || (addon.needsSelection && !selected)}
              onClick={() => setNotice(runBuiltinAddon(addon.id, editor))}>Run</button>
          </div>)}
          <small>For a feature that changes selected text, select the text in the document before opening Extensions → Add-ons.</small>
        </div>}
        {mode === 'addonsInfo' && <div className="guide-list">
          <h3>Extensions for Nexa Docs</h3>
          <p>Nexa Docs currently provides a curated set of first-party, local extensions. Each utility calls the editor's documented selection and replacement methods and does not transmit text to a server.</p>
          <p>A public third-party extension SDK, sandbox, marketplace, capability permissions and package signing are not yet provided. Running arbitrary downloaded scripts inside an editor handling private files would be unsafe.</p>
          <p>For now, developers can add source-controlled utilities in <code>src/extensions/builtinAddons.js</code>. The extension registry provides labels, descriptions and selected-text requirements.</p>
        </div>}
        {mode === 'feedback' && <div className="guide-list">
          <h3>How to report an issue</h3><p>Record the browser and version, the exact menu action, reproduction steps, and any console error. Share these with the developer through the project’s published support channel once available. No automatic feedback submission is configured.</p>
          <p>Do not include private documents, executable content or personal information in public bug reports.</p>
        </div>}
        {mode === 'preferences' && <div className="nexa-preferences">
          <label className="nexa-check"><input type="checkbox" checked={editor.spellcheck} onChange={e => editor.setSpellcheck(e.target.checked)} /> Use browser spellcheck</label>
          <label className="nexa-check"><input type="checkbox" checked={view.showRuler} onChange={e => view.setShowRuler(e.target.checked)} /> Show rulers</label>
          <label className="nexa-check"><input type="checkbox" checked={view.showLineNumbers} onChange={e => view.setShowLineNumbers(e.target.checked)} /> Show line numbers</label>
          <label className="nexa-check"><input type="checkbox" checked={view.showNonPrinting} onChange={e => view.setShowNonPrinting(e.target.checked)} /> Show paragraph marks</label>
          <label className="nexa-check"><input type="checkbox" checked={view.showResolved} onChange={e => view.setShowResolved(e.target.checked)} /> Show resolved comments</label>
        </div>}
        {mode === 'accessibility' && <div className="guide-list"><p>Nexa Docs supports keyboard shortcuts, native text selection, labeled editing controls, and visible focus states. Use Tab to navigate controls and Escape to close dialogs.</p><p>Complex editor navigation and screen-reader announcements need further testing before accessibility conformance can be claimed.</p></div>}
        {mode === 'shortcuts' && <div className="shortcut-grid">{[
          ['Bold', 'Ctrl/⌘+B'], ['Italic', 'Ctrl/⌘+I'], ['Underline', 'Ctrl/⌘+U'], ['Undo', 'Ctrl/⌘+Z'],
          ['Redo', 'Ctrl/⌘+Y'], ['Link', 'Ctrl/⌘+K'], ['Save local draft', 'Ctrl/⌘+S'], ['Find / replace', 'Ctrl/⌘+H'],
          ['Select all (editor)', 'Ctrl/⌘+A'], ['Indent list', 'Tab'], ['Outdent list', 'Shift+Tab']
        ].map(([title, keys]) => <div key={title}><span>{title}</span><kbd>{keys}</kbd></div>)}</div>}
        <FeatureDialogs mode={mode} editor={editor} view={view} onClose={onClose} setNotice={setNotice} />
        {notice && <p className="dialog-notice" role="status">{notice}</p>}
      </div>
    </div>
  </div>;
}
