import React, { useEffect, useRef, useState } from 'react';
import DropdownFolder from '../menuComponents/dropdown_folder';

/** Owns menu open/close state so Header doesn't need to know menu internals. */
export default function Menu({ groups }) {
  const [openMenu, setOpenMenu] = useState(null);
  const navRef = useRef(null);

  useEffect(() => {
    if (!openMenu) return undefined;
    const handlePointerDown = event => {
      if (navRef.current && !navRef.current.contains(event.target) && !event.target?.closest?.('.submenu-panel, .menu-popover')) setOpenMenu(null);
    };
    const handleEscape = event => {
      if (event.key === 'Escape') setOpenMenu(null);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [openMenu]);

  const runAction = action => {
    setOpenMenu(null);
    action();
  };

  return (
    <nav className="menu-bar" aria-label="Document menus" ref={navRef}>
      {groups.map(group => (
        <DropdownFolder
          key={group.label}
          label={group.label}
          items={group.items}
          open={openMenu === group.label}
          onToggle={() => setOpenMenu(previous => previous === group.label ? null : group.label)}
          onHover={() => { if (openMenu && openMenu !== group.label) setOpenMenu(group.label); }}
          onAction={runAction}
        />
      ))}
    </nav>
  );
}
