import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMobileViewport } from '../../mobile/MobilePanel';
import Dropdown from './dropdown';

/** One top-level document menu (File, Edit, Help). */
export default function DropdownFolder({ label, items, open, onToggle, onAction, onHover }) {
  const triggerRef = useRef(null);
  const { mobile } = useMobileViewport();
  const [position, setPosition] = useState({ top: 0, left: 0 });
  useLayoutEffect(() => {
    if (!mobile || !open) return undefined;
    const update = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPosition({ top: Math.min(window.innerHeight - 80, rect.bottom + 4),
        left: Math.max(5, Math.min(rect.left, window.innerWidth - Math.min(315, window.innerWidth - 10) - 5)) });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [mobile, open]);
  const menuId = `nexa-menu-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <div className="menu-anchor">
      <button ref={triggerRef} type="button" className={`menu-trigger ${open ? 'menu-open' : ''}`}
        aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
        onClick={onToggle} onMouseEnter={onHover}>
        {label}
      </button>
      {open && (mobile
        ? createPortal(<Dropdown id={menuId} label={label} items={items} onAction={onAction}
            style={{ position: 'fixed', left: position.left, top: position.top, zIndex: 5100,
              width: `min(315px, calc(100vw - 10px))` }} />, document.body)
        : <Dropdown id={menuId} label={label} items={items} onAction={onAction} />)}
    </div>
  );
}
