import React, { useRef, useState } from 'react';
import { clamp, INCH, INDENT_STEP, pxToIndentUnits, rulerGeometry, roundRuler } from './rulerMath';

const LABELS = {
  marginLeft: 'Left page margin',
  marginRight: 'Right page margin',
  indent: 'Left indent',
  firstLineIndent: 'First-line indent',
  rightIndent: 'Right indent',
};

/** Page-aligned horizontal ruler; updates document settings or selected paragraph.
 * Geometry is logical CSS px and the outer canvas supplies the zoom. */
export default function MarginRulerTop({ page, paragraph, onChange, disabled = false }) {
  const rulerRef = useRef(null);
  const dragRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const geometry = rulerGeometry(page, paragraph);
  const { width } = geometry;
  const points = preview ? { ...geometry, ...preview } : geometry;
  const limit = (kind, value) => {
    switch (kind) {
      case 'marginLeft': return clamp(roundRuler(value), 24, width / 2 - 96);
      case 'marginRight': return clamp(roundRuler(width - value), 24, width / 2 - 96);
      case 'indent': return clamp(pxToIndentUnits(value - points.leftMargin), 0, 8);
      case 'firstLineIndent': return clamp(roundRuler(value - points.left), -Math.min(96, points.indent * INDENT_STEP), Math.max(0, width - points.rightMargin - points.rightIndent - points.left - 44));
      case 'rightIndent': return clamp(roundRuler(width - points.rightMargin - value), 0, Math.max(0, width - points.rightMargin - points.left - 44));
      default: return 0;
    }
  };
  const pointValue = (event) => {
    const rect = rulerRef.current?.getBoundingClientRect();
    if (!rect?.width) return 0;
    return (event.clientX - rect.left) * width / rect.width;
  };
  const begin = (event, kind) => {
    if (disabled || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = { id: event.pointerId, kind, value: null };
    event.currentTarget.setPointerCapture(event.pointerId);
    move(event, kind);
  };
  const move = (event, kindOverride) => {
    const drag = dragRef.current;
    if (!drag || (!kindOverride && event.pointerId !== drag.id)) return;
    const kind = kindOverride || drag.kind;
    const value = limit(kind, pointValue(event));
    drag.value = value;
    if (kind === 'marginLeft') setPreview({ leftMargin: value, side: value, left: value + points.indent * INDENT_STEP,
      first: value + points.indent * INDENT_STEP + points.firstLineIndent });
    else if (kind === 'marginRight') setPreview({ rightMargin: value, right: width - value - points.rightIndent });
    else if (kind === 'indent') setPreview({ indent: value, left: points.side + value * INDENT_STEP,
      first: points.side + value * INDENT_STEP + points.firstLineIndent });
    else if (kind === 'firstLineIndent') setPreview({ firstLineIndent: value, first: points.left + value });
    else if (kind === 'rightIndent') setPreview({ rightIndent: value, right: width - points.rightMargin - value });
  };
  const end = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    // Use actual final pointer position, even when release occurs without a move.
    const value = limit(drag.kind, pointValue(event));
    dragRef.current = null;
    setPreview(null);
    if (event.type === 'pointerup') onChange(drag.kind, value);
  };
  // Like Google Docs: only the two left-indent tabs and right-indent triangle
  // are persistently visible. Page-margin targets remain operable on hover,
  // keyboard focus and touch, without cluttering the numbered ruler.
  const handle = (kind, x, extra = '', name = LABELS[kind], ariaValue = x) => <button key={`${kind}-${extra}`} type="button"
    className={`ruler-handle ruler-handle-${kind} ${extra}`}
    style={{ left: `${x}px` }}
    role="slider" aria-label={name} aria-valuemin={kind === 'firstLineIndent' ? -96 : 0}
    aria-valuemax={kind === 'indent' ? 8 : Math.round(width / 2)} aria-valuenow={kind === 'indent' ? Number(ariaValue.toFixed(3)) : Math.round(ariaValue)}
    title={`${name}: ${kind === 'indent' ? `${(ariaValue * INDENT_STEP / INCH).toFixed(2)} in` : `${(ariaValue / INCH).toFixed(2)} in`}. Drag or use arrow keys.`}
    disabled={disabled} onPointerDown={event => begin(event, kind)} onPointerMove={move}
    onPointerUp={end} onPointerCancel={end}
    onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return;
      event.preventDefault();
      const initial = kind === 'marginLeft' ? geometry.leftMargin : kind === 'marginRight' ? geometry.rightMargin : kind === 'indent' ? geometry.indent : geometry[kind];
      const next = event.key === 'Home' ? (kind === 'marginLeft' || kind === 'marginRight' ? 24 : 0) : initial + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 12 : 3) * (kind === 'indent' ? 1 / INDENT_STEP : 1);
      const bounded = (kind === 'marginLeft' || kind === 'marginRight') ? clamp(next, 24, width / 2 - 96) : kind === 'indent' ? clamp(pxToIndentUnits(next * INDENT_STEP), 0, 8)
        : kind === 'firstLineIndent' ? clamp(next, -Math.min(96, geometry.indent * INDENT_STEP), Math.max(0, width - geometry.rightMargin - geometry.rightIndent - geometry.left - 44))
        : clamp(next, 0, Math.max(0, width - geometry.rightMargin - geometry.left - 44));
      onChange(kind, bounded);
    }} />;
  const ticks = Array.from({ length: Math.floor(width / 12) + 1 }, (_, index) => {
    const position = index * 12;
    const major = index % 8 === 0;
    return <div key={index} className={`nexa-ruler-tick ${major ? 'is-major' : index % 4 === 0 ? 'is-half' : ''}`}
      style={{ left: `${position}px` }}>{major && position > 0 && <span className="nexa-ruler-number">{position / INCH}</span>}</div>;
  });
  return <div ref={rulerRef} className="ruler-top" style={{ width: `${width}px` }} aria-label="Horizontal margin and indentation ruler">
    <div className="ruler-top-margin" style={{ left: 0, width: `${points.leftMargin}px` }} />
    <div className="ruler-top-margin" style={{ right: 0, width: `${points.rightMargin}px` }} />
    <div className="ruler-top-ticks" aria-hidden="true">{ticks}</div>
    {handle('marginLeft', points.leftMargin, 'is-left-margin is-subtle-margin', 'Left page margin', points.leftMargin)}
    {handle('marginRight', width - points.rightMargin, 'is-right-margin is-subtle-margin', 'Right page margin', points.rightMargin)}
    {handle('indent', points.left, 'is-paragraph-indent', 'Left indent', points.indent)}
    {handle('firstLineIndent', points.first, 'is-first-line-tab', 'First-line indent', points.firstLineIndent)}
    {handle('rightIndent', points.right, 'is-right-indent', 'Right indent', points.rightIndent)}
  </div>;
}
