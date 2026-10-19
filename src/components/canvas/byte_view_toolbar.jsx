import React from 'react';
const modes = [
  ['context', 'Context / instructions'], ['values', 'Raw byte values'], ['frequency', 'Frequency heatmap'], ['roles', 'Instruction encoding roles'],
];
const hex = value => value.toString(16).toUpperCase().padStart(2,'0');
export default function ByteViewToolbar({ mode, onMode, matchHover, onMatchHover, showAscii, onShowAscii,
  groups, onRemoveGroup, onClear, onFindNext, onCopySelection, matchedCount, windowSize }) {
  return <div className="byteframe-view-tools" aria-label="ByteFrame visual analysis tools">
    <div className="byteframe-view-controls">
      <label>Data view <select aria-label="Byte display mode" value={mode} onChange={e=>onMode(e.target.value)}>
        {modes.map(([value,label])=><option key={value} value={value}>{label}</option>)}
      </select></label>
      <label className="byteframe-tool-check"><input type="checkbox" checked={matchHover} onChange={e=>onMatchHover(e.target.checked)} /> Hover matches</label>
      <label className="byteframe-tool-check"><input type="checkbox" checked={showAscii} onChange={e=>onShowAscii(e.target.checked)} /> ASCII column</label>
      <button type="button" onClick={onFindNext} disabled={!groups.length}>Next match ↓</button>
      <button type="button" onClick={onCopySelection}>Copy offset + byte</button>
      <button type="button" onClick={onClear} disabled={!groups.length}>Clear highlights</button>
    </div>
    <div className="byteframe-view-hint">Hover a byte to preview matching values. Click to pin all matches; Ctrl/Cmd+click adds a color group. Shift+click a second byte pins a contiguous pattern (up to 32 bytes). Matching applies to the {windowSize.toLocaleString()} loaded bytes only.</div>
    {!!groups.length && <div className="byteframe-match-pins" aria-label="Pinned byte patterns">
      {groups.map((group,index)=><button type="button" key={group.id} className={`byteframe-match-pin match-palette-${index%8}`}
        onClick={()=>onRemoveGroup(group.id)} title="Remove this match group">
        <span className="byteframe-match-dot"/>{group.bytes.map(hex).join(' ')} <span aria-hidden="true">×</span>
      </button>)}
      <small>{matchedCount.toLocaleString()} highlighted byte positions in viewport</small>
    </div>}
  </div>;
}
