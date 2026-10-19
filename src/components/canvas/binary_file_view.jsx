import React, { useEffect, useMemo, useRef, useState } from 'react';
import { inspectBinaryStructure } from '../../byteframe/core/binaryStructure';
import { decodeX86At, instructionCategory } from '../../byteframe/core/x86Decoder';
import { readableBytes } from '../../byteframe/core/readableBytes';
import { normalizeBinaryOffset, regionAtOffset, rawByteCategory, instructionIndexForWindow } from '../../byteframe/core/binaryNavigation';
import { putByteEdit, overlayByteEdits, buildPatchedBinaryBlob, downloadBlobWithName } from '../../byteframe/core/binaryEdits';
import OpcodeExplainer from './opcode_explainer';
import ByteViewToolbar from './byte_view_toolbar';
import { buildByteMatchMap, byteHistogram, MAX_MATCH_GROUPS, MAX_PATTERN_BYTES } from '../../byteframe/core/matchGroups';

const PAGE_BYTES = 4096;
const HEADER_BYTES = 131072;
const PREVIEW_STRIDE = 32768;
const BYTES_PER_ROW = 16;
const hex = v => v.toString(16).toUpperCase().padStart(2, '0');
const address = n => n.toString(16).toUpperCase().padStart(8, '0');
const categoryNames = {
  code: 'Executable code', data: 'Program data', header: 'File header', metadata: 'Metadata',
  section: 'File section', segment: 'File segment', unknown: 'Unclassified bytes',
};
const roleNames = {prefix:'Prefix', opcode:'Opcode', modrm:'ModR/M', sib:'SIB', immediate:'Immediate', displacement:'Displacement'};

/** Read a small prefix and virtualized viewport; never stringify/upload an entire executable. */
export default function BinaryFileView({ file, showByteFrame, onToggleByteFrame, onClose, onRegisterDownload }) {
  const [prefix, setPrefix] = useState(null);
  const [percent, setPercent] = useState(0);
  const [stage, setStage] = useState('Reading file header');
  const [error, setError] = useState('');
  const [offset, setOffset] = useState(0);
  const [input, setInput] = useState('0');
  const [baseWindowBytes, setBaseWindowBytes] = useState(null);
  const [edits, setEdits] = useState(() => new Map());
  const [editHex, setEditHex] = useState('');
  const [editMessage, setEditMessage] = useState('');
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState('');
  const [selected, setSelected] = useState(0);
  const [viewMode, setViewMode] = useState('context');
  const [matchHover, setMatchHover] = useState(true);
  const [showAscii, setShowAscii] = useState(true);
  const [pinned, setPinned] = useState([]);
  const [matchNotice, setMatchNotice] = useState('');
  const hoverNodes = useRef([]);
  const inspectorHoverNode = useRef(null);
  const byteAnchor = useRef(null);
  const loadId = useRef(0);
  const hexScrollRef = useRef(null);
  const [jumpNotice, setJumpNotice] = useState('');
  const jump = (value, label = '') => {
    const destination = normalizeBinaryOffset(value, file.size);
    if (destination === null) {
      setJumpNotice('That offset is outside the file.');
      return;
    }
    const firstRow = Math.floor(destination / BYTES_PER_ROW) * BYTES_PER_ROW;
    // Keep the requested byte in the first row. Reads remain bounded to 4 KiB.
    setOffset(firstRow);
    setSelected(destination);
    setInput(destination.toString(16).toUpperCase());
    setJumpNotice(label ? `Jumped to ${label} · 0x${address(destination)}` : '');
    if (hexScrollRef.current) hexScrollRef.current.scrollTop = 0;
  };
  useEffect(() => {
    let stopped = false;
    setPrefix(null); setPercent(0); setStage('Reading file header'); setError('');
    setOffset(0); setSelected(0); setInput('0'); setBaseWindowBytes(null); setJumpNotice(''); setEdits(new Map()); setEditMessage(''); setExportError(''); setPinned([]); setMatchNotice(''); byteAnchor.current=null;
    (async () => {
      try {
        const cap = Math.min(file.size, HEADER_BYTES);
        const destination = new Uint8Array(cap);
        for (let at = 0; at < cap; at += PREVIEW_STRIDE) {
          const end = Math.min(at + PREVIEW_STRIDE, cap);
          const block = new Uint8Array(await file.slice(at, end).arrayBuffer());
          if (stopped) return;
          destination.set(block, at);
          setPercent(cap ? Math.round(end / cap * 100) : 100);
          // Yield after each small slice so the progress bar can actually paint.
          await new Promise(resolve => setTimeout(resolve, 0));
        }
        if (!stopped) { setPrefix(destination); setPercent(100); setStage('Ready'); }
      } catch (problem) { if (!stopped) setError(problem?.message || 'Unable to read file.'); }
    })();
    return () => { stopped = true; };
  }, [file]);
  useEffect(() => {
    if (!prefix) return undefined;
    const id = ++loadId.current;
    setBaseWindowBytes(null);
    file.slice(offset, Math.min(offset + PAGE_BYTES, file.size)).arrayBuffer()
      .then(buffer => { if (loadId.current === id) setBaseWindowBytes(new Uint8Array(buffer)); })
      .catch(problem => { if (loadId.current === id) setError(problem.message || 'Unable to read file region.'); });
    return () => { loadId.current++; };
  }, [file, prefix, offset]);
  // Structure and disassembly both reflect staged edits before download.
  const windowBytes = useMemo(() => overlayByteEdits(baseWindowBytes, offset, edits), [baseWindowBytes, offset, edits]);
  const inspectedPrefix = useMemo(() => overlayByteEdits(prefix, 0, edits), [prefix, edits]);
  const structure = useMemo(() => inspectedPrefix && inspectBinaryStructure(inspectedPrefix), [inspectedPrefix]);
  const section = useMemo(() => regionAtOffset(structure?.sections, selected), [structure, selected]);
  const instructionByByte = useMemo(() => instructionIndexForWindow(windowBytes, offset, structure?.sections, decodeX86At, instructionCategory, structure), [windowBytes, structure, offset]);
  const decoded = instructionByByte.get(selected) || null;
  // Use only confirmed, contiguous decoded items in the visible executable window.
  // The analysis is best-effort and does not establish true control-flow reachability.
  const instructionSequence = useMemo(() => {
    const unique = new Map();
    for (const instruction of instructionByByte.values()) if (!unique.has(instruction.start)) unique.set(instruction.start, instruction);
    return [...unique.values()].sort((a, b) => a.start - b.start);
  }, [instructionByByte]);
  const selectedInstructionBytes = decoded && windowBytes ? Array.from(windowBytes.slice(decoded.start - offset, decoded.start - offset + decoded.size)) : [];
  const focusExplainedByte = (index) => {
    const target = hexScrollRef.current;
    if (!target) return;
    target.querySelectorAll('.binary-byte.is-explained').forEach(el => el.classList.remove('is-explained'));
    if (index === null || !decoded) return;
    target.querySelector(`[data-byte-offset="${decoded.start + index}"]`)?.classList.add('is-explained');
  };
  // All search/highlight operations use the staged bytes, never the source File.
  const matchGroups = useMemo(() => buildByteMatchMap(windowBytes, pinned), [windowBytes, pinned]);
  const frequencies = useMemo(() => byteHistogram(windowBytes), [windowBytes]);
  const byteDisplayClass = (value) => {
    if (viewMode === 'frequency') {
      const fraction = frequencies[value] / Math.max(1, windowBytes?.length || 1);
      return fraction >= .125 ? 'byte-heat-hot' : fraction >= .04 ? 'byte-heat-medium' : 'byte-heat-cold';
    }
    return '';
  };
  const clearHover = () => {
    for (const el of hoverNodes.current) el.classList.remove('is-hover-match');
    hoverNodes.current = [];
    if (inspectorHoverNode.current) inspectorHoverNode.current.classList.remove('is-source-hover');
    inspectorHoverNode.current = null;
  };
  const hoverGridByte = event => {
    const cell = event.target.closest?.('.binary-byte[data-hex-value]');
    if (!cell || !event.currentTarget.contains(cell)) return;
    if (cell === event.relatedTarget?.closest?.('.binary-byte')) return;
    clearHover();
    if (matchHover) {
      const value = cell.dataset.hexValue;
      hoverNodes.current = [...event.currentTarget.querySelectorAll(`.binary-byte[data-hex-value="${value}"]`)];
      for (const el of hoverNodes.current) el.classList.add('is-hover-match');
    }
    const byteOffset = Number(cell.dataset.byteOffset);
    if (decoded && byteOffset >= decoded.start && byteOffset < decoded.start + decoded.size) {
      const node = document.querySelector(`.binary-analysis-rail .byte-explain-byte[data-component-byte-index="${byteOffset - decoded.start}"]`);
      if (node) { node.classList.add('is-source-hover'); inspectorHoverNode.current = node; }
    }
  };
  const chooseGridByte = (event, abs) => {
    setSelected(abs);
    if (!windowBytes) return;
    const local = abs - offset;
    const anchor = byteAnchor.current;
    const pattern = event.shiftKey && anchor !== null && anchor >= offset && anchor < offset + windowBytes.length
      ? Array.from(windowBytes.slice(Math.min(local, anchor - offset), Math.max(local, anchor - offset) + 1)) : [windowBytes[local]];
    if (pattern.length > MAX_PATTERN_BYTES) { setMatchNotice(`Contiguous patterns are limited to ${MAX_PATTERN_BYTES} bytes.`); return; }
    const next = { id: `${abs}:${Date.now()}`, bytes: pattern };
    setPinned(previous => event.ctrlKey || event.metaKey
      ? [...previous.slice(-(MAX_MATCH_GROUPS-1)), next] : [next]);
    if (!event.shiftKey) byteAnchor.current = abs;
    setMatchNotice(`${pattern.length} byte pattern pinned; matching occurrences are highlighted in this loaded window.`);
  };
  const findNextMatch = () => {
    if (!windowBytes || !matchGroups.size) return;
    const positions = [...matchGroups.keys()].sort((a,b) => a-b);
    const next = positions.find(v => v > selected-offset) ?? positions[0];
    if (next === undefined) return;
    const abs = offset + next;
    setSelected(abs); byteAnchor.current = abs;
    hexScrollRef.current?.querySelector(`[data-byte-offset="${abs}"]`)?.scrollIntoView({ block:'nearest' });
  };
  const copySelectedByte = async () => {
    if (!windowBytes || selected < offset || selected >= offset + windowBytes.length) return;
    try { await navigator.clipboard.writeText(`0x${address(selected)}: ${hex(windowBytes[selected-offset])}`);
      setMatchNotice('Selected byte and offset copied.'); }
    catch { setMatchNotice('Clipboard access was denied.'); }
  };
  const rows = useMemo(() => {
    if (!windowBytes) return [];
    const items = [];
    for (let at = 0; at < windowBytes.length; at += BYTES_PER_ROW)
      items.push({ at: offset + at, bytes: windowBytes.slice(at, at + BYTES_PER_ROW) });
    return items;
  }, [windowBytes, offset]);
  const selectedByte = windowBytes && selected >= offset && selected < offset + windowBytes.length ? windowBytes[selected - offset] : null;
  const originalByte = baseWindowBytes && selected >= offset && selected < offset + baseWindowBytes.length ? baseWindowBytes[selected - offset] : null;
  useEffect(() => {
    setEditHex(selectedByte === null ? '' : hex(selectedByte));
  }, [selected, selectedByte]);
  const applyEdit = () => {
    const raw = editHex.trim().replace(/^0x/i, '');
    if (originalByte === null || !/^[\da-fA-F]{2}$/.test(raw)) {
      setEditMessage('Enter exactly two hexadecimal digits (00–FF).');
      return;
    }
    const value = Number.parseInt(raw, 16);
    setEdits(current => putByteEdit(current, selected, value, originalByte));
    setEditMessage(`Byte 0x${address(selected)} staged as ${hex(value)}. Download to save a new file.`);
  };
  const resetSelected = () => {
    if (originalByte === null) return;
    setEdits(current => putByteEdit(current, selected, originalByte, originalByte));
    setEditHex(hex(originalByte));
    setEditMessage('Reverted selected byte to the original.');
  };
  const downloadPatched = () => {
    if (exportBusy) return;
    setExportBusy(true);
    setExportError('');
    try {
      const blob = buildPatchedBinaryBlob(file, edits);
      // Preserve original filename AND extension. Never mutate the source File.
      downloadBlobWithName(blob, file.name);
      setEditMessage(`Download requested: ${file.name} (${edits.size} replaced bytes).`);
    } catch (problem) {
      setExportError(problem?.message || 'Could not prepare download.');
    } finally { setExportBusy(false); }
  };
  // Ctrl/Cmd+S downloads a new file, preserving its original filename.
  useEffect(() => {
    const onSaveShortcut = event => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        downloadPatched();
      }
    };
    window.addEventListener('keydown', onSaveShortcut);
    return () => window.removeEventListener('keydown', onSaveShortcut);
  });
  // Expose the same original-extension download from File → Download.
  useEffect(() => {
    onRegisterDownload?.(downloadPatched);
    return () => onRegisterDownload?.(null);
  });
  const category = section?.kind || 'unknown';
  const executableSection = structure?.sections?.find(region => region.kind === 'code' &&
    normalizeBinaryOffset(region.start, file.size) !== null);
  const codeSupported = structure?.architecture?.family === 'x86' && structure?.architecture?.verified;
  const jumpToSection = region => jump(region.start, region.name);
  const closeWithConfirmation = () => {
    if (edits.size && !window.confirm(`${edits.size} edited byte(s) are not exported yet. Close ByteFrame and discard them?`)) return;
    onClose();
  };
  return <main className="binary-workspace" aria-label="Raw binary file viewer">
    <div className="binary-toolbar">
      <div><span className="binary-eyebrow">NEXA DOCS · RAW FILE MODE</span>
        <h2>{file.name}</h2><small>{readableBytes(file.size)} · {file.size.toLocaleString()} bytes · byte editing (staged)</small></div>
      <div className="binary-actions"><button type="button" className="binary-download" onClick={downloadPatched} disabled={exportBusy}>{exportBusy ? 'Preparing…' : edits.size ? `Download edited ${file.name}` : `Download original ${file.name}`}</button><button type="button" onClick={onToggleByteFrame} aria-pressed={showByteFrame}>{showByteFrame ? 'Hide' : 'Show'} ByteFrame</button>
        <button type="button" onClick={closeWithConfirmation}>Close preview</button></div>
    </div>
    {!prefix && !error && <div className="binary-loader" role="status" aria-live="polite">
      <strong>{stage}…</strong><p>Reading only the first {readableBytes(Math.min(file.size, HEADER_BYTES))} for structural analysis. The rest stays on disk until requested.</p>
      <div className="binary-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={percent} aria-label="Read preview header"><div style={{ width: `${percent}%` }} /></div>
      <span>{percent}% · {readableBytes(Math.min(file.size, HEADER_BYTES) * percent / 100)} / {readableBytes(Math.min(file.size, HEADER_BYTES))}</span>
    </div>}
    {error && <div className="binary-read-error" role="alert">{error}</div>}
    {prefix && <div className="binary-layout">
      <section className={`binary-hex-panel binary-view-${viewMode} ${showAscii ? '' : 'binary-hide-ascii'}`} aria-label="Hex byte viewport">
        <div className="binary-navigation">
          <button type="button" onClick={() => jump(Math.max(0, offset - PAGE_BYTES))} disabled={!offset}>← Previous</button>
          <form onSubmit={e => { e.preventDefault(); const trimmed = input.trim().replace(/^0x/i, ''); if (/^[0-9a-f]+$/i.test(trimmed)) jump(parseInt(trimmed, 16)); }}>
            <label htmlFor="binary-goto-offset">Offset (hex)</label><input id="binary-goto-offset" value={input} onChange={e => setInput(e.target.value)} aria-label="Hexadecimal offset" />
            <button type="submit">Go</button></form>
          <button type="button" onClick={() => jump(offset + PAGE_BYTES)} disabled={offset + PAGE_BYTES >= file.size}>Next →</button>
          {executableSection && <button type="button" className="binary-jump-code" onClick={() => jumpToSection(executableSection)}>↳ First code section</button>}
        </div>
        {jumpNotice && <p className="binary-jump-notice" role="status">{jumpNotice}</p>}
        <form className="binary-edit-controls" onSubmit={event => { event.preventDefault(); applyEdit(); }} aria-label="Edit selected byte">
          <label htmlFor="binary-byte-value">Replace byte at 0x{address(selected)}</label>
          <input id="binary-byte-value" inputMode="text" spellCheck={false} autoComplete="off" maxLength={4}
            value={editHex} onChange={event => setEditHex(event.target.value.toUpperCase())}
            placeholder="00–FF" disabled={originalByte === null} aria-label="Replacement byte in hexadecimal" />
          <button type="submit" disabled={originalByte === null}>Apply byte</button>
          <button type="button" onClick={resetSelected} disabled={originalByte === null || !edits.has(selected)}>Revert byte</button>
          <button type="button" onClick={() => { if (window.confirm(`Discard all ${edits.size} staged byte changes?`)) { setEdits(new Map()); setEditMessage('Staged byte changes cleared.'); } }} disabled={!edits.size}>Discard edits</button>
          <span className="binary-edits-counter" aria-live="polite">{edits.size.toLocaleString()} changed bytes · original file untouched</span>
        </form>
        {editMessage && <p className="binary-edit-notice" role="status">{editMessage}</p>}
        {exportError && <p className="binary-read-error" role="alert">{exportError}</p>}
        <ByteViewToolbar mode={viewMode} onMode={setViewMode} matchHover={matchHover} onMatchHover={value => { clearHover(); setMatchHover(value); }}
          showAscii={showAscii} onShowAscii={setShowAscii} groups={pinned}
          onRemoveGroup={id => setPinned(current=>current.filter(group=>group.id!==id))}
          onClear={()=>{setPinned([]);setMatchNotice('Cleared pinned highlights.');}}
          onFindNext={findNextMatch} onCopySelection={copySelectedByte}
          matchedCount={matchGroups.size} windowSize={windowBytes?.length || 0} />
        {matchNotice && <div className="byteframe-match-notice" role="status">{matchNotice}</div>}
        <div className="binary-color-legend" aria-label="Byte colors">
          <span className="legend-header">Header</span><span className="legend-code">Code</span>
          <span className="legend-data">Data</span><span className="legend-section">Other sections</span>
          <span className="legend-zero">00</span><span className="legend-ascii">ASCII</span>
          {executableSection && <><span className="legend-arithmetic">Arithmetic</span><span className="legend-control">Control flow</span><span className="legend-stack">Stack</span><span className="legend-system">System</span></>}
        </div>
        <div className="binary-columns" aria-hidden="true"><span>OFFSET</span><span>HEX BYTES</span><span>ASCII</span></div>
        {windowBytes === null ? <p className="binary-window-loading">Loading bytes at 0x{address(offset)}…</p> :
          <div className="binary-rows" ref={hexScrollRef} role="grid" aria-label="Loaded bytes; click a byte for details" onMouseOver={hoverGridByte} onMouseLeave={clearHover} onMouseOut={event => {
            if (!event.relatedTarget?.closest?.('.binary-byte')) clearHover();
          }}>{rows.map(row =>
            <div key={row.at} className="binary-row" role="row">
              <span className="binary-address" role="rowheader">{address(row.at)}</span>
              <div className="binary-byte-cells" role="gridcell">{Array.from(row.bytes, (value, i) => {
                const abs = row.at + i, region = regionAtOffset(structure?.sections, abs), instruction = instructionByByte.get(abs);
                return <button key={abs} type="button" className={`binary-byte byte-region-${region?.kind || 'unknown'} ${!region ? `binary-raw-${rawByteCategory(value)}` : ''} ${instruction ? `binary-opcode-${instruction.category} binary-role-${instruction.role}` : ''} ${edits.has(abs) ? 'is-edited' : ''} ${decoded && instruction && decoded.start === instruction.start ? 'is-instruction-member' : ''} ${matchGroups.has(abs-offset) ? `match-palette-${matchGroups.get(abs-offset)}` : ''} ${byteDisplayClass(value,abs-offset)} ${selected === abs ? 'is-current' : ''}`}
                  data-byte-offset={abs} data-hex-value={hex(value)} 
                  aria-label={`Offset 0x${address(abs)}, byte ${hex(value)}${instruction ? `, ${instruction.mnemonic}, ${roleNames[instruction.role] || instruction.role}` : `, ${categoryNames[region?.kind || 'unknown']}`}`}  aria-selected={selected === abs} onClick={event => chooseGridByte(event, abs)}>{hex(value)}</button>;
              })}</div>
              <span className="binary-ascii" role="gridcell">{Array.from(row.bytes, value => value >= 32 && value <= 126 ? String.fromCharCode(value) : '.').join('')}</span>
            </div>)}</div>}
        <div className="binary-viewport-footer">Showing {windowBytes?.length?.toLocaleString() || 0} bytes of {file.size.toLocaleString()} · sections are inferred from bounded header inspection</div>
      </section>
      {showByteFrame && <aside className="binary-analysis-rail" aria-label="ByteFrame analysis">
        <span className="binary-eyebrow">BYTEFRAME · INDEPENDENT INSPECTOR</span>
        <h3>Byte interpretation</h3>
        <div className="binary-selected-value"><strong>{selectedByte === null ? '—' : hex(selectedByte)}</strong>
          <span>0x{address(selected)} · {selectedByte === null ? 'Loading' : `${selectedByte} unsigned · ${selectedByte > 127 ? selectedByte - 256 : selectedByte} signed 8-bit · ${selectedByte.toString(2).padStart(8, '0')} binary`}</span></div>
        <p className="binary-section-tag">{section?.name || 'Unclassified'} · {categoryNames[category] || category}</p>
        <p>{section?.detail || 'This byte has no identified file section in the inspected header region.'}</p>
        <p className="binary-decoder-mode">{structure?.architecture
          ? `Architecture: ${structure.architecture.label}`
          : 'Architecture unknown · no instruction set assumed from extension alone'}</p>
        {selectedByte !== null && <p className="binary-selected-role">{decoded
          ? `${roleNames[decoded.role] || 'Instruction byte'} · ${categoryNames.code}`
          : section ? `${categoryNames[section.kind] || 'Structural data'} · ${section.name}`
          : `Raw ${rawByteCategory(selectedByte)} byte · no executable semantics inferred`}</p>}
        {decoded?.incomplete && <p className="binary-warning" role="status">{decoded.explanation}</p>}
        {decoded && !decoded.incomplete && <div className="binary-opcode">
          <b className={`byte-category-${instructionCategory(decoded.mnemonic)}`}>{decoded.mnemonic} {decoded.operands}</b>
          <OpcodeExplainer instruction={decoded}
            bytes={selectedInstructionBytes} baseOffset={decoded.start} sequence={instructionSequence}
            selectedIndex={selected - decoded.start}
            onChooseByte={index => setSelected(decoded.start + index)} onHoverByte={focusExplainedByte}
            onChooseInstruction={start => setSelected(start)} />
        </div>}
        {structure && <><h4>Detected structure: {structure.format || 'Unrecognized'}</h4>
          <small>Inspected first {structure.inspectedBytes?.toLocaleString()} bytes; file never executed.</small>
          <div className="binary-sections">{structure.sections.slice(0, 80).map((s, i) => {
            const available = normalizeBinaryOffset(s.start, file.size) !== null;
            const active = section === s;
            return <button type="button" key={`${s.name}-${i}`} disabled={!available}
              className={`binary-section-link ${active ? 'is-active' : ''} byte-region-${s.kind}`}
              aria-current={active ? 'location' : undefined}
              aria-label={`Jump to ${s.name}, physical file offset 0x${address(s.start)}`}
              title={available ? `Jump to file offset 0x${address(s.start)}` : 'Region lies outside this file'}
              onClick={() => jumpToSection(s)}>
              <b>{s.name}</b><span>{s.kind} · 0x{address(s.start)} · {s.size.toLocaleString()} B</span>
            </button>;
          })}</div>
          {structure.clues?.slice(0,12).map((clue,i) => <p key={i} className="binary-clue">{clue}</p>)}
          {structure.warnings?.slice(0,8).map((warning,i) => <p key={i} className="binary-warning">{warning}</p>)}
        </>}
        {!codeSupported && <p className="binary-decoder-note">Structure colors represent file regions; disassembly is limited to identified x86 executable regions with a supported and verified execution mode. Unsupported machine types remain raw bytes.</p>}
        <p className="binary-readonly-note">Edits are staged in memory as same-length byte replacements. Download creates a new file with its original name and extension; no file is executed or overwritten. Changing executable bytes may invalidate digital signatures or cause crashes.</p>
      </aside>}
    </div>}
  </main>;
}
