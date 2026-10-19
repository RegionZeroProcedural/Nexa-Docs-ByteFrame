import OpcodeExplainer from './opcode_explainer';
import React, { useMemo } from 'react';
const CATEGORY_LABELS = {
  arithmetic: 'Arithmetic / logical', data: 'Data movement',
  control: 'Control flow', stack: 'Stack', system: 'Processor / system',
  unknown: 'Raw / undecoded', structure: 'File structure / metadata',
};
/** Standalone ByteFrame analysis, available for any document on demand. */
export default function ByteInspectorPanel({ analysis, structure, groups = [], onSelect, truncated = false, analyzing = false, onHover }) {
  const token = analysis?.token, group = analysis?.group;
  const summary = useMemo(() => groups.reduce((total, g) => {
    if (g.kind !== 'machine' || g.category === 'unknown' || g.category === 'structure') return total;
    return { decoded: total.decoded + 1, calls: total.calls + (g.mnemonic === 'CALL' ? 1 : 0),
      branches: total.branches + (/^J/.test(g.mnemonic) ? 1 : 0),
      syscalls: total.syscalls + (g.mnemonic === 'SYSCALL' ? 1 : 0),
      hasControls: total.hasControls || g.category === 'control' };
  }, {decoded:0,calls:0,branches:0,syscalls:0,hasControls:false}), [groups]);
  const sequence = useMemo(() => {
    if (group?.kind !== 'machine') return [];
    // Groups are sorted by character position. Search around the active group,
    // not through every token during a cursor move in a large hex document.
    let lo = 0, hi = groups.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1;
      if (groups[mid].start < group.start) lo = mid + 1; else hi = mid;
    }
    return groups.slice(Math.max(0, lo - 12), Math.min(groups.length, lo + 13))
      .filter(item => item.kind === 'machine' && Number.isFinite(item.byteStart) &&
        item.snippetStart === group.snippetStart)
      .map(item => ({ start:item.byteStart, size:item.byteSize || item.tokens.length,
        mnemonic:item.mnemonic, operands:item.operands, explanation:item.explanation,
        roles:item.tokens.map(t => t.role) }));
  }, [groups, group]);
  return <aside className="byte-inspector-rail" aria-label="Hex and opcode inspector" contentEditable={false}>
    <div className="byte-inspector-heading">
      <span className="byte-inspector-kicker">BYTEFRAME · ANALYSIS</span>
      <strong>Instruction inspector</strong>
      <small>Architecture-aware instruction preview · passive binary inspection</small>
    </div>
    {structure?.format && <section className="byte-structure" aria-label="File format and section explorer">
      <div className="byte-structure-title"><span className="byte-inspector-caption">Detected file format</span><strong>{structure.format}</strong></div>
      <small>Examined {structure.inspectedBytes.toLocaleString()} extracted bytes. Static headers only; no execution.</small>
      {structure.sections.length > 0 && <>
        <div className="byte-inspector-caption">File sections / regions ({structure.sections.length})</div>
        <div className="byte-structure-sections">{structure.sections.slice(0, 64).map((section, i) =>
          <button type="button" key={`${section.name}-${i}`} disabled={section.sourceOffset === null}
            onClick={() => onSelect(section.sourceOffset)}
            title={section.sourceOffset === null ? 'This section is beyond the currently decoded text bytes' : (section.detail || `Jump to ${section.name}`)}
            className={`byte-structure-section ${section.kind === 'code' ? 'is-code' : ''}`}>
            <span><strong>{section.name}</strong><i>{section.kind}</i></span>
            <small>{`Offset 0x${section.start.toString(16).toUpperCase()} · ${section.size.toLocaleString()} B`}{!section.available ? ' · partially loaded' : ''}</small>
          </button>)}
        </div>
        {structure.sections.length > 64 && <small>Showing first 64 regions.</small>}
      </>}
      {structure.imports?.length > 0 && <>
        <div className="byte-inspector-caption">Declared imported libraries</div>
        <div className="byte-structure-sections" aria-label="Imported DLLs and API symbols">
          {structure.imports.slice(0,24).map((lib,index)=><div className="byte-structure-import" key={`${lib.library}-${index}`}>
            <strong>{lib.library}</strong>
            {lib.symbols.length > 0 ? <small>{lib.symbols.slice(0,16).join(' · ')}</small> : <small>Symbols unavailable in inspected prefix.</small>}
          </div>)}
        </div>
      </>}
      {structure.clues.length > 0 && <>
        <div className="byte-inspector-caption">Structural &amp; behavior clues</div>
        <div className="byte-structure-clues">{structure.clues.map((clue, i) => <p key={i}>{clue}</p>)}</div>
      </>}
      {structure.warnings.map((warning, i) => <p className="byte-structure-warning" key={i}>{warning}</p>)}
    </section>}
    {summary.decoded > 0 && <section className="byte-structure byte-flow-summary" aria-label="Static control flow signals">
      <div className="byte-inspector-caption">Static instruction patterns</div>
      <div className="byte-flow-metrics"><span><strong>{summary.decoded}</strong> decoded</span><span><strong>{summary.calls}</strong> calls</span><span><strong>{summary.branches}</strong> jumps</span><span><strong>{summary.syscalls}</strong> syscalls</span></div>
      {summary.hasControls && <p>The pasted byte sequence contains control-transfer instructions. These indicate possible call sites and branches, not confirmed runtime paths, functions, or processes.</p>}
      <small>Counts describe supported decoded encodings in the preview, not exhaustive binary analysis.</small>
    </section>}
    {truncated && <p className="byte-inspector-limit">Preview scanner covers the first 250,000 text characters. Later regions are not analyzed in this build.</p>}
    {!token || !group ? <div className="byte-inspector-empty">
      {analyzing && <p role="status" className="byte-analysis-pending">Updating opcode analysis after typing…</p>}
      <strong>Select a byte or opcode</strong>
      <p>Paste space-separated hex bytes (for example <code>48 83 C0 05</code>) or an assembly instruction into this document. Place the cursor on a colored byte to inspect it.</p>
      <p>The analysis is local and does not execute the content. For structure inspection, paste a hex representation beginning with a PE, ELF, WASM, PNG, ZIP or other supported signature.</p>
    </div> : <div className="byte-inspector-body">
      <div className={`byte-inspector-category byte-category-${group.category}`}>{CATEGORY_LABELS[group.category] || 'Unknown'}</div>
      <p className="byte-inspector-offset">Position {token.start.toLocaleString()}–{token.end.toLocaleString()} · {token.kind === 'byte' ? 'Hex byte' : 'Assembly opcode'}</p>
      <h3>{group.mnemonic}{group.operands ? ` ${group.operands}` : ''}</h3>
      <p className="byte-inspector-description">{group.explanation}</p>
      <OpcodeExplainer instruction={{ ...group, size:group.byteSize || group.tokens.length,
        mode:group.architectureMode || group.mode || 64, roles:group.tokens.map(part => part.role) }}
        bytes={group.tokens.filter(part => part.kind === 'byte').map(part => part.value)}
        baseOffset={group.byteStart ?? group.start}
        selectedIndex={Math.max(0, group.tokens.findIndex(part => part.id === token.id))}
        available={group.kind !== 'structure' && group.category !== 'unknown'} sequence={sequence}
        onChooseByte={index => { const part = group.tokens[index]; if (part) onSelect(part.start, part.end); }}
        onChooseInstruction={offset => { const item = groups.find(candidate => candidate.byteStart === offset && candidate.snippetStart === group.snippetStart); if (item) onSelect(item.start, item.end); }}
        onHoverByte={index => onHover?.(index === null ? null : group.tokens[index]?.start)} />
      <p className="byte-inspector-caution">Conservative preview decoder: a subset of x86/x64 encodings is supported. Unknown bytes are not assumed to be valid instructions. Runtime behavior and absolute addresses are not inferred.</p>
    </div>}
  </aside>;
}
