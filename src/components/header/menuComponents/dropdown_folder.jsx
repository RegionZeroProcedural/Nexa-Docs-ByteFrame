import React from 'react';
import Dropdown from './dropdown';

/** One top-level document menu (File, Edit, Help). */
export default function DropdownFolder({ label, items, open, onToggle, onAction, onHover }) {
  const menuId = `nexa-menu-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <div className="menu-anchor">
      <button type="button" className={`menu-trigger ${open ? 'menu-open' : ''}`}
        aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
        onClick={onToggle} onMouseEnter={onHover}>
        {label}
      </button>
      {open && <Dropdown id={menuId} label={label} items={items} onAction={onAction} />}
    </div>
  );
}
