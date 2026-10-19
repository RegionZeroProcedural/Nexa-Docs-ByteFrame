import React, { useRef, useState } from 'react';
import { clamp, INCH, rulerGeometry, roundRuler } from './rulerMath';

/** Draggable top/bottom page margin guides; edits remain local until pointerup. */
export default function MarginRulerLeft({ page, onChange, disabled = false, onPreview }) {
  const geometry = rulerGeometry(page);
  const { height } = geometry;
  const trackRef = useRef(null);
  const dragRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const top = preview?.top ?? geometry.top;
  const bottom = preview?.bottom ?? geometry.bottom;
  const coord = event => {
    const box = trackRef.current?.getBoundingClientRect();
    return box?.height ? (event.clientY - box.top) * height / box.height : 0;
  };
  const move = (event) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.id) return;
    const px = coord(event);
    const value = clamp(roundRuler(drag.kind === 'top' ? px : height - px), 24, height / 2 - 24);
    drag.value = value;
    setPreview(prev => ({ ...prev, [drag.kind]: value }));
    onPreview?.(drag.kind, value);
  };
  const begin = (event, kind) => {
    if (disabled || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    dragRef.current = { id: event.pointerId, kind };
    event.currentTarget.setPointerCapture(event.pointerId);
    move(event);
  };
  const end = event => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.id) return;
    const value = clamp(roundRuler(drag.kind === 'top' ? coord(event) : height - coord(event)), 24, height / 2 - 24);
    dragRef.current = null;
    setPreview(null);
    onPreview?.(null, null);
    if (event.type === 'pointerup') onChange(drag.kind, value);
  };
  const adjustKey = (event, kind) => {
    if (!['ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) return;
    event.preventDefault();
    const curr = geometry[kind];
    const step = event.shiftKey ? 12 : 3;
    onChange(kind, clamp(event.key === 'Home' ? 24 : curr + (event.key === 'ArrowDown' ? 1 : -1) * step, 24, height / 2 - 24));
  };
  const ticks = Array.from({ length: Math.floor(height / 12) + 1 }, (_, index) => {
    const position = index * 12;
    const major = index % 8 === 0;
    return <div key={index} className={`ruler-left-tick ${major ? 'ruler-left-tick-major' : index % 4 === 0 ? 'ruler-left-tick-half' : ''}`}
      style={{ top: `${position}px` }}>{major && position > 0 && <span className="ruler-left-number">{position / INCH}</span>}</div>;
  });
  const boundary = (kind, y, amount) => <button type="button" className={`ruler-left-handle ruler-left-handle-${kind}`}
    style={{ top: `${y}px` }} disabled={disabled} role="slider" aria-label={`${kind === 'top' ? 'Top' : 'Bottom'} page margin`}
    aria-valuemin={24} aria-valuemax={Math.round(height / 2 - 24)} aria-valuenow={Math.round(amount)}
    title={`${kind === 'top' ? 'Top' : 'Bottom'} margin: ${(amount / INCH).toFixed(2)} in. Drag to change the page text starting point or use arrow keys.`}
    onPointerDown={event => begin(event, kind)} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
    onKeyDown={event => adjustKey(event, kind)} />;
  return <div ref={trackRef} className="ruler-left" style={{ height: `${height}px` }} aria-label="Vertical page margin ruler">
    <div className="ruler-left-track" />
    <div className="ruler-left-margin ruler-left-margin-top" style={{ height: `${top}px` }} title="Drag the shaded top margin to move the page text starting point"
      onPointerDown={e => begin(e, 'top')} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
    <div className="ruler-left-margin ruler-left-margin-bottom" style={{ height: `${bottom}px` }} title="Drag the shaded bottom margin to change the page bottom spacing"
      onPointerDown={e => begin(e, 'bottom')} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
    <div className="ruler-left-ticks" aria-hidden="true">{ticks}</div>
    {boundary('top', top, top)}
    {boundary('bottom', height - bottom, bottom)}
  </div>;
}
