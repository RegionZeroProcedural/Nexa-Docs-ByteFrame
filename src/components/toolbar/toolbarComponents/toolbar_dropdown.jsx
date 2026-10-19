import React, { useEffect, useRef, useState } from 'react';
import ToolIcon from './tool_icon';
/** Consistent lightweight popup for toolbar menus. */
export default function ToolbarDropdown({ label, value, icon, wide = false, children, disabled, className = '' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = event => { if (!ref.current?.contains(event.target)) setOpen(false); };
    const escape = event => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, [open]);
  return <div className={`toolbar-menu ${className}`} ref={ref}>
    <button type="button" className={`toolbar-menu-trigger ${open ? 'menu-open' : ''}`}
      title={label} aria-label={label} aria-haspopup="menu" aria-expanded={open} disabled={disabled}
      onMouseDown={e => e.preventDefault()} onClick={() => setOpen(v => !v)}>
      {icon && <ToolIcon name={icon} size={18} />}
      {value && <span className="toolbar-menu-value">{value}</span>}
      <ToolIcon name="chevron" size={13} />
    </button>
    {open && <div role="menu" className={`toolbar-menu-popover ${wide ? 'toolbar-menu-wide' : ''}`} onClick={e => {
      if (e.target.closest('[role="menuitem"]')) setOpen(false);
    }}>{children}</div>}
  </div>;
}
export function DropdownOption({ children, selected, onClick, icon }) {
  return <button type="button" role="menuitem" className={`toolbar-option ${selected ? 'option-selected' : ''}`}
    onMouseDown={e => e.preventDefault()} onClick={onClick}>
    {icon && <ToolIcon name={icon} size={17} />}<span>{children}</span>{selected && <ToolIcon name="check" size={14} />}
  </button>;
}
