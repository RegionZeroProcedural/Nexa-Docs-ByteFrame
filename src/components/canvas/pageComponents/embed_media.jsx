import React, { useEffect, useRef, useState } from 'react';
import { clamp } from '../../../editorCore/embedPosition';
import { snapEmbedPosition } from '../../../editorCore/embedSnapping';
import { updateTableCell, updateChartPoint } from '../../../editorCore/embedDataEdits';

/** Focusable edit field inside a non-editable floating object. Editing is staged
 * locally so typing in cells does NOT trigger document repagination per keypress.
 * Blur/Enter commits; Escape cancels. Keep events away from the document editor. */
function ObjectField({ value, label, onCommit, numeric = false, maxLength = 600, readOnly = false, className = '' }) {
  const original = String(value ?? '');
  const [draft, setDraft] = useState(original);
  const focused = useRef(false);
  const cancelled = useRef(false);
  useEffect(() => { if (!focused.current) setDraft(original); }, [original]);
  if (readOnly) return <span className={className}>{original}</span>;
  const finish = () => {
    focused.current = false;
    if (cancelled.current) {
      cancelled.current = false;
      setDraft(original);
      return;
    }
    const next = numeric ? draft.trim() : draft;
    if (numeric && (!next || !Number.isFinite(Number(next)))) {
      setDraft(original);
      return;
    }
    if (next !== original) onCommit(numeric ? Number(next) : next.slice(0, maxLength));
  };
  return <input type={numeric ? 'number' : 'text'} className={`nexa-inline-object-field ${className}`}
    aria-label={label} title={`${label} · Enter to save, Escape to cancel`}
    value={draft} maxLength={numeric ? undefined : maxLength} step={numeric ? 'any' : undefined}
    onFocus={() => { focused.current = true; cancelled.current = false; }}
    onChange={event => setDraft(event.target.value)} onBlur={finish}
    onKeyDown={event => {
      event.stopPropagation();
      if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
      if (event.key === 'Escape') { event.preventDefault(); cancelled.current = true; event.currentTarget.blur(); }
    }}
    onInput={event => event.stopPropagation()} onBeforeInput={event => event.stopPropagation()}
    onKeyUp={event => event.stopPropagation()}
    onCompositionStart={event => event.stopPropagation()} onCompositionEnd={event => event.stopPropagation()}
    onPaste={event => event.stopPropagation()} onCopy={event => event.stopPropagation()}
    onCut={event => event.stopPropagation()}
    onPointerDown={event => event.stopPropagation()} onPointerUp={event => event.stopPropagation()}
    onMouseDown={event => event.stopPropagation()} onMouseUp={event => event.stopPropagation()}
    onDoubleClick={event => event.stopPropagation()} onClick={event => event.stopPropagation()} />;
}

/** Floating visual objects: page-relative coordinates and stable logical offsets. */
function FloatingEmbed({ item, pageIndex, pageWidth, pageHeight, marginLeft, marginRight, marginTop, marginBottom,
  onRemove, onEdit, onMove, onUpdate, readOnly }) {
  const [preview, setPreview] = useState(null);
  const dragRef = useRef(null);
  const x = preview?.position?.x ?? item.position?.x ?? marginLeft;
  const y = preview?.position?.y ?? item.position?.y ?? marginTop + 12;
  const guides = preview?.pageIndex === pageIndex ? preview.guides || [] : [];

  const handlePointerDown = event => {
    if (readOnly || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    const target = event.currentTarget;
    const block = target.closest('.nexa-document-block');
    const frame = target.closest('.paper-page');
    if (!frame || !block) return;
    const frameRect = frame.getBoundingClientRect();
    const scale = frame.clientWidth ? frameRect.width / frame.clientWidth : 1;
    const blockRect = block.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      dx: (event.clientX - blockRect.left) / scale,
      dy: (event.clientY - blockRect.top) / scale,
      width: block.offsetWidth,
      height: block.offsetHeight,
    };
    target.setPointerCapture(event.pointerId);
  };
  const findPosition = event => {
    const drag = dragRef.current;
    if (!drag) return null;
    const underPointer = document.elementFromPoint(event.clientX, event.clientY);
    const frame = underPointer?.closest('.paper-page') ||
      document.querySelector(`.paper-page-frame[data-page-number="${pageIndex + 1}"] .paper-page`);
    if (!frame) return null;
    const frameRect = frame.getBoundingClientRect();
    const scale = frame.clientWidth ? frameRect.width / frame.clientWidth : 1;
    const neighbors = [...frame.querySelectorAll('.nexa-floating-object')]
      .filter(node => node.dataset.objectId !== item.id)
      .map(node => ({ x: node.offsetLeft, y: node.offsetTop, width: node.offsetWidth, height: node.offsetHeight }));
    const result = snapEmbedPosition({
      x: (event.clientX - frameRect.left) / scale - drag.dx,
      y: (event.clientY - frameRect.top) / scale - drag.dy,
    }, { width: drag.width, height: drag.height }, {
      width: frame.clientWidth, height: frame.clientHeight,
      marginLeft, marginRight, marginTop, marginBottom,
    }, neighbors, { disabled: event.altKey });
    return {
      pageIndex: Math.max(0, Number(frame.closest('[data-page-number]')?.dataset.pageNumber || pageIndex + 1) - 1),
      position: result.position, guides: result.guides,
    };
  };
  const handleMove = event => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    const next = findPosition(event);
    if (next) setPreview(next);
  };
  const handleFinish = event => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    const next = findPosition(event) || preview;
    dragRef.current = null;
    setPreview(null);
    if (next) onMove?.(item.id, { pageIndex: next.pageIndex, position: next.position });
  };

  const moveWithKeyboard = event => {
    const steps = { ArrowLeft:[-1,0], ArrowRight:[1,0], ArrowUp:[0,-1], ArrowDown:[0,1] };
    if (!steps[event.key]) return;
    event.preventDefault(); event.stopPropagation();
    const step = event.shiftKey ? 1 : 8;
    const [dx,dy] = steps[event.key];
    const size = { width: event.currentTarget.closest('.nexa-document-block')?.offsetWidth || 325,
      height: event.currentTarget.closest('.nexa-document-block')?.offsetHeight || 180 };
    const next = snapEmbedPosition({ x:x+dx*step,y:y+dy*step }, size, {
      width:pageWidth, height:pageHeight, marginLeft,marginRight,marginTop,marginBottom,
    }, [], { disabled:true });
    onMove?.(item.id, { pageIndex, position:next.position });
  };
  const patchTableCell = (rowIndex, colIndex, value) => {
    const patch = updateTableCell(item, rowIndex, colIndex, value);
    if (patch) onUpdate?.(item.id, patch);
  };
  const patchChartPoint = (index, changes) => {
    const patch = updateChartPoint(item, index, changes);
    if (patch) onUpdate?.(item.id, patch);
  };
  const pointMax = Math.max(1, ...(item.points || []).map(p => Math.abs(Number(p.value) || 0)));
  return <>
    {guides.map(guide => <div key={guide.axis} className={`nexa-snap-guide nexa-snap-guide-${guide.axis}`}
      style={guide.axis === 'x' ? { left:guide.at } : { top:guide.at }}
      aria-hidden="true" />)}
    <figure className={`nexa-document-block nexa-floating-object ${preview ? 'is-dragging' : ''}`}
      data-object-id={item.id} contentEditable={false} style={{ left:x, top:y }}>
      <div className="nexa-object-chrome">
        {!readOnly && <button className="nexa-object-grip" type="button" aria-label={`Drag ${item.type} to reposition; snaps to margins and guides`}
          title="Drag to align with margins, page center or objects · Alt disables snapping · Arrow keys move, Shift+arrows fine-tune"
          onPointerDown={handlePointerDown} onPointerMove={handleMove} onPointerUp={handleFinish}
          onPointerCancel={() => { dragRef.current = null; setPreview(null); }} onKeyDown={moveWithKeyboard}>
          <span aria-hidden="true">⠿</span></button>}
        <span className="nexa-object-name">{item.alt || item.title || `${item.type} block`}</span>
        {!readOnly && <div className="nexa-block-actions">
          <button type="button" onClick={() => onEdit?.(item)}>Edit all</button>
          <button type="button" onClick={() => onRemove?.(item.id)}>Remove</button>
        </div>}
      </div>
      {item.type === 'image' && <img src={item.src} alt={item.alt || 'Document image'} loading="lazy"
        style={{ width:`${Math.min(100,Math.max(20,Number(item.width)||100))}%` }} />}
      {item.type === 'table' && <div className="nexa-table-scroller"><table className={`nexa-document-table nexa-table-${item.theme || 'minimal'}`}>
        <tbody>{item.rows?.map((row,i)=><tr key={i}>{row.map((cell,j)=>{
          const Field = <ObjectField value={cell} label={`Table row ${i+1}, column ${j+1}`}
            readOnly={readOnly} onCommit={value => patchTableCell(i,j,value)} />;
          return i === 0 ? <th scope="col" key={j}>{Field}</th> : <td key={j}>{Field}</td>;
        })}</tr>)}</tbody>
      </table></div>}
      {item.type === 'chart' && <div className="nexa-block-chart" aria-label={`${item.title || 'Chart'} with editable values`}>
        <ObjectField value={item.title || 'Chart'} className="nexa-chart-title"
          label="Chart title" readOnly={readOnly} maxLength={140}
          onCommit={title => onUpdate?.(item.id,{ title })} />
        {(item.points || []).map((pt,index)=><div key={index} className="nexa-chart-row">
          <ObjectField value={pt.label} label={`Chart label ${index+1}`} readOnly={readOnly} maxLength={90}
            onCommit={label => patchChartPoint(index,{ label })} />
          <div className="nexa-chart-track" aria-hidden="true"><i style={{width:`${Math.abs(Number(pt.value)||0)/pointMax*100}%`}} /></div>
          <ObjectField value={pt.value} className="nexa-chart-value" label={`Chart value ${index+1}`}
            numeric readOnly={readOnly} onCommit={value => patchChartPoint(index,{ value })} />
        </div>)}
      </div>}
    </figure>
  </>;
}

export default function EmbedMedia({ items, pageIndex, pageWidth, pageHeight, marginLeft, marginRight, marginTop, marginBottom,
  onRemove, onEdit, onMove, onUpdate, readOnly }) {
  if (!items?.length) return null;
  return <div className="nexa-floating-layer" contentEditable={false} aria-label="Draggable document objects">
    {items.map(item => <FloatingEmbed key={item.id} item={item} pageIndex={pageIndex} pageWidth={pageWidth}
      pageHeight={pageHeight} marginLeft={marginLeft} marginRight={marginRight} marginTop={marginTop} marginBottom={marginBottom}
      onRemove={onRemove} onEdit={onEdit} onMove={onMove} onUpdate={onUpdate} readOnly={readOnly} />)}
  </div>;
}
