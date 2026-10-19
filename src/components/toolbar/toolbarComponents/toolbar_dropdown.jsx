import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMobileViewport } from '../../mobile/MobilePanel';
import ToolIcon from './tool_icon';
/** Consistent lightweight popup for toolbar menus. */
export default function ToolbarDropdown({ label, value, icon, wide = false, children, disabled, className = '' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const popupRef = useRef(null);
  const { mobile } = useMobileViewport();
  const [position, setPosition] = useState({ left: 6, top: 105 });
  useLayoutEffect(() => {
    if (!open || !mobile) return undefined;
    const update = () => {
      const rect = ref.current?.getBoundingClientRect();
      if (rect) setPosition({
        left: Math.max(6, Math.min(rect.left, window.innerWidth - Math.min(220, window.innerWidth - 12))),
        top: Math.min(window.innerHeight - 85, rect.bottom + 5),
      });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [open, mobile]);
  useEffect(() => {
    if (!open) return;
    const close = event => { if (!ref.current?.contains(event.target) && !popupRef.current?.contains(event.target)) setOpen(false); };
    const escape = event => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, [open]);
  const popover = <div ref={popupRef} role="menu" className={`toolbar-menu-popover ${wide ? 'toolbar-menu-wide' : ''}`}
    style={mobile ? { position: 'fixed', zIndex: 5100, top: position.top, left: position.left,
      maxWidth: 'calc(100vw - 12px)', maxHeight: 'min(370px, calc(100dvh - 130px))' } : undefined}
    onClick={e => { if (e.target.closest('[role="menuitem"]')) setOpen(false); }}>{children}</div>;
  return <div className={`toolbar-menu ${className}`} ref={ref}>
    <button type="button" className={`toolbar-menu-trigger ${open ? 'menu-open' : ''}`}
      title={label} aria-label={label} aria-haspopup="menu" aria-expanded={open} disabled={disabled}
      onMouseDown={e => e.preventDefault()} onClick={() => setOpen(v => !v)}>
      {icon && <ToolIcon name={icon} size={18} />}
      {value && <span className="toolbar-menu-value">{value}</span>}
      <ToolIcon name="chevron" size={13} />
    </button>
    {open && (mobile ? createPortal(popover, document.body) : popover)}
  </div>;
}
export function DropdownOption({ children, selected, onClick, icon }) {
  return <button type="button" role="menuitem" className={`toolbar-option ${selected ? 'option-selected' : ''}`}
    onMouseDown={e => e.preventDefault()} onClick={onClick}>
    {icon && <ToolIcon name={icon} size={17} />}<span>{children}</span>{selected && <ToolIcon name="check" size={14} />}
  </button>;
}
