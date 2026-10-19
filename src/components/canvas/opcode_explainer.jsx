import React, { useMemo, useState } from 'react';
import { EXPLANATION_LEVELS, beginnerExplanation, instructionEffects, analyzeNearbyPattern, traceKnownRegisters, instructionByteMap, nearbyInstructionWalkthrough } from '../../byteframe/core/instructionInsights';

/** Shared ByteFrame learning UI for the document hex text and uploaded binaries.
 * Selecting an encoding byte explains its fields and focuses the matching
 * source byte; hover highlights are temporary and do not move the caret. */
export default function OpcodeExplainer({ instruction, bytes = [], baseOffset = 0, selectedIndex = 0,
  sequence = [], onChooseByte, onHoverByte, onChooseInstruction, available = true }) {
  const [level, setLevel] = useState('beginner');
  const safeBytes = useMemo(() => Array.from(bytes).slice(0, 15), [bytes]);
  const hasInstruction = !!instruction?.mnemonic && instruction.mnemonic !== 'Unknown / raw byte';
  const byteMap = useMemo(() => hasInstruction ? instructionByteMap(instruction, safeBytes, baseOffset) : [], [instruction, safeBytes, baseOffset, hasInstruction]);
  const current = byteMap[selectedIndex] || byteMap[0];
  const pattern = useMemo(() => level === 'advanced' && hasInstruction ? analyzeNearbyPattern(sequence, baseOffset) : null,
    [sequence, baseOffset, hasInstruction, level]);
  const symbolic = useMemo(() => level === 'advanced' && hasInstruction ? traceKnownRegisters(sequence, baseOffset) : [],
    [sequence, baseOffset, hasInstruction, level]);
  const walkthrough = useMemo(() => level === 'advanced' ? nearbyInstructionWalkthrough(sequence, baseOffset) : [],
    [sequence, baseOffset, level]);
  const effects = useMemo(() => hasInstruction ? instructionEffects(instruction) : [], [instruction, hasInstruction]);
  if (!available || !hasInstruction) return <div className="byte-explain-unknown">
    <strong>{instruction?.category === 'structure' ? 'File structure / data' : 'Unverified encoding'}</strong>
    <p>{instruction?.category === 'structure'
      ? 'These bytes belong to a recognized file region, not a verified instruction. Select an executable section to explore supported opcodes.'
      : 'ByteFrame cannot reliably decode an instruction at this position. It may be data, an incomplete encoding or an unsupported instruction. No processor behavior is inferred.'}</p>
  </div>;
  return <div className="byte-explain" aria-label="Interactive opcode explanation">
    <div className="byte-explain-levels" role="group" aria-label="Explanation depth">
      {EXPLANATION_LEVELS.map(option => <button type="button" key={option.id}
        onClick={() => setLevel(option.id)} aria-pressed={level === option.id}
        className={`byte-explain-level ${level === option.id ? 'is-active' : ''}`}>{option.label}</button>)}
    </div>
    <div className="byte-explain-summary" aria-live="polite">
      {level === 'beginner' && <><span className="byte-inspector-caption">Plain English</span><p>{beginnerExplanation(instruction)}</p></>}
      {level !== 'beginner' && <><span className="byte-inspector-caption">Instruction semantics</span>
        <p>{instruction.explanation || beginnerExplanation(instruction)}</p>
        {effects.length > 0 && <ul>{effects.map((effect, i) => <li key={i}>{effect}</li>)}</ul>}
        <div className="byte-explain-encoding-facts" aria-label="Decoded instruction metadata">
          <span>Mode: <b>x86-{instruction.mode || instruction.architectureMode || 'unknown'}</b></span>
          <span>Length: <b>{instruction.size} bytes</b></span>
          <span>Encoding: <b>{safeBytes.map(v => v.toString(16).padStart(2, '0').toUpperCase()).join(' ')}</b></span>
          {Number.isSafeInteger(baseOffset) && <span>File / source offset: <b>0x{baseOffset.toString(16).toUpperCase()}</b>–<b>0x{(baseOffset+instruction.size-1).toString(16).toUpperCase()}</b></span>}
          {Number.isInteger(instruction.displacementWidth) && <>
            <span>Operand: <b>{instruction.displacementWidth}-bit signed, little-endian</b></span>
            <span>Relative displacement: <b>{instruction.displacement >= 0 ? '+' : ''}{instruction.displacement} ({instruction.displacement < 0 ? '-' : '+'}0x{Math.abs(instruction.displacement).toString(16).toUpperCase()})</b></span>
            {instruction.resolvedTarget?.rva !== null && instruction.resolvedTarget?.rva !== undefined
              && <span>Destination RVA: <b>0x{instruction.resolvedTarget.rva.toString(16).toUpperCase()}</b></span>}
            {Number.isSafeInteger(instruction.resolvedTarget?.virtualAddress)
              && <span>Destination virtual address (preferred image base): <b>0x{instruction.resolvedTarget.virtualAddress.toString(16).toUpperCase()}</b></span>}
            {Number.isSafeInteger(instruction.resolvedTarget?.fileOffsetTarget)
              && <span>Destination file offset: <b>0x{instruction.resolvedTarget.fileOffsetTarget.toString(16).toUpperCase()}</b></span>}
            {(!instruction.resolvedTarget || instruction.resolvedTarget.addressKind === 'unmapped')
              && <span>Destination address: <b>Unresolved — no verified virtual-address mapping</b></span>}
          </>}
        </div>
      </>}
      {level === 'advanced' && <><span className="byte-inspector-caption">Nearby instruction pattern</span>
        {pattern ? <div className="byte-explain-pattern"><strong>{pattern.label}</strong><p>{pattern.summary}</p><small>{pattern.caution}</small></div>
          : <p className="byte-explain-muted">No supported multi-instruction pattern identified around this instruction in the current continuous decoded window.</p>}
        {walkthrough.length > 1 && <div className="byte-explain-walkthrough" aria-label="Nearby decoded instruction walkthrough">
          <span className="byte-inspector-caption">Nearby decoded instructions · not a confirmed execution path</span>
          {walkthrough.map(item => <button type="button" key={item.start}
            disabled={!onChooseInstruction || item.active}
            onClick={() => onChooseInstruction?.(item.start)}
            className={`byte-explain-walkthrough-step ${item.active ? 'is-active' : ''}`}>
            <strong>{item.mnemonic} {item.operands}</strong><span>{item.plainEnglish}</span>
          </button>)}
        </div>}
        {symbolic.length > 0 && <div className="byte-explain-trace"><span className="byte-inspector-caption">Constrained symbolic example</span>
          {symbolic.map((item, i) => <div key={i}><b>{item.register}</b> · {item.before} → {item.after}<small>{item.assumption}</small></div>)}</div>}
        <small className="byte-explain-caveat">Static preview only: no control-flow recovery, confirmed function boundaries, runtime registers or verified execution paths. Address-space loading and relocation may change runtime addresses.</small>
      </>}
    </div>
    {byteMap.length > 0 && <section className="byte-explain-components" aria-label="Instruction encoding components">
      <span className="byte-inspector-caption">Encoding · select or hover a byte</span>
      <div className="byte-explain-byte-grid">
        {byteMap.map(info => <button type="button" key={info.index}
          className={`byte-explain-byte byte-part-${info.role} ${info.index === selectedIndex ? 'is-selected' : ''}`}
          data-component-byte-index={info.index}
          aria-pressed={info.index === selectedIndex}
          aria-label={`${info.value.toString(16).padStart(2,'0').toUpperCase()} · ${info.title} · offset ${info.offset}`}
          onClick={() => onChooseByte?.(info.index)}
          onMouseEnter={() => onHoverByte?.(info.index)} onMouseLeave={() => onHoverByte?.(null)}
          onFocus={() => onHoverByte?.(info.index)} onBlur={() => onHoverByte?.(null)}>
          <strong>{info.value.toString(16).padStart(2,'0').toUpperCase()}</strong><span>{info.role}</span>
        </button>)}
      </div>
      {current && <div className="byte-explain-component-detail" aria-live="polite"
        onMouseEnter={() => onHoverByte?.(current.index)} onMouseLeave={() => onHoverByte?.(null)}>
        <strong>{current.title} <span>· byte {current.index + 1} of {byteMap.length}</span></strong>
        <p>{current.explanation}</p>
        {(level !== 'beginner' && current.bits) && <small>{current.bits}</small>}
      </div>}
    </section>}
    <p className="byte-explain-caveat">Execution mode comes from the file header when available (otherwise pasted hex defaults to x86-64). An arbitrary viewport start is not a verified instruction boundary. Unsupported encodings, code/data ambiguity, processor state and loader relocation can affect interpretation.</p>
  </div>;
}
