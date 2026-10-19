import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import DropdownSection from './dropdown_section';
import MenuScrollArea from './menu_scroll_area';
import DropdownChildIcon from './dropdown_child_icon';
import DropdownChildKeys from './dropdown_child_keys';
import DropdownChildTag from './dropdown_child_tag';

const CLOSE_DELAY = 210;

/** Flyouts are portalled so the parent menu's scroll viewport cannot clip them.
 * A short transfer grace period lets the mouse cross menu edges without flicker. */
export default function DropdownChild({ item, onAction, expanded, onActivate, onDeactivate, onKeepOpen }) {
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const closeTimer = useRef(null);
  const [position, setPosition] = useState(null);
  const hasSubmenu = Boolean(item.children?.length) && !item.disabled;

  const cancelClose = useCallback(() => {
    clearTimeout(closeTimer.current);
    onKeepOpen?.();
  }, [onKeepOpen]);
  const scheduleClose = useCallback(() => {
    if (!hasSubmenu) return;
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => onDeactivate(), CLOSE_DELAY);
  }, [hasSubmenu, onDeactivate]);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !panelRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const popup = panelRef.current;
    const width = popup.offsetWidth || 280;
    const rightSide = rect.right + width <= window.innerWidth - 8;
    const left = rightSide ? rect.right - 3 : Math.max(6, rect.left - width + 3);
    // Align with the hovered option, not a fixed global flyout position.
    // Near the bottom, shift only enough to keep a usable scroll area.
    const preferredTop = Math.max(7, rect.top - 3);
    const top = Math.max(7, Math.min(preferredTop, window.innerHeight - 175));
    const maxHeight = Math.max(90, Math.min(590, window.innerHeight - top - 9));
    setPosition(previous => previous && previous.left === left && previous.top === top && previous.maxHeight === maxHeight
      ? previous : { left, top, maxHeight });
  }, []);

  useLayoutEffect(() => {
    if (!expanded || !hasSubmenu) return undefined;
    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
      clearTimeout(closeTimer.current);
    };
  }, [expanded, hasSubmenu, updatePosition]);
  if (item.separator) return <div className="menu-separator" role="separator" />;

  return <div className={`menu-item-wrap ${hasSubmenu ? 'has-submenu' : ''} ${expanded ? 'submenu-expanded' : ''}`}
    onMouseEnter={() => { cancelClose(); onActivate(); }}
    onMouseLeave={scheduleClose}>
    <button ref={triggerRef} type="button" role="menuitem"
      className={item.checked ? 'is-selected' : undefined}
      aria-label={item.checked ? `${item.label}, selected` : undefined}
      aria-haspopup={hasSubmenu ? 'menu' : undefined} aria-expanded={hasSubmenu ? Boolean(expanded) : undefined}
      title={item.reason || item.label} disabled={Boolean(item.disabled)}
      onMouseDown={event => event.preventDefault()}
      onFocus={() => { if (hasSubmenu) { cancelClose(); onActivate(); } }}
      onKeyDown={event => {
        if (hasSubmenu && ['ArrowRight', 'Enter', ' '].includes(event.key)) { event.preventDefault(); onActivate(); }
        if (hasSubmenu && event.key === 'ArrowLeft') { event.preventDefault(); onDeactivate(); }
      }}
      onClick={() => hasSubmenu ? onActivate() : onAction?.(item.action)}>
      <span className="menu-item-label"><DropdownChildIcon name={item.checked ? 'check' : item.icon} /><span>{item.label}</span></span>
      <span className="menu-item-meta"><DropdownChildTag tag={item.tag} /><DropdownChildKeys shortcut={item.shortcut} />
        {hasSubmenu && <span className="menu-submenu-arrow" aria-hidden="true">▸</span>}</span>
    </button>
    {hasSubmenu && expanded && createPortal(
      <div ref={panelRef} className="submenu-panel" role="menu" aria-label={`${item.label} submenu`}
        style={position ? { top: position.top, left: position.left, '--flyout-max-height': `${position.maxHeight}px` } : { top: -9999, left: -9999, visibility: 'hidden' }}
        onMouseEnter={cancelClose} onMouseLeave={scheduleClose}>
        <MenuScrollArea><DropdownSection label={item.label} items={item.children} onAction={onAction} onKeepOpen={cancelClose} /></MenuScrollArea>
      </div>, document.body)}
  </div>;
}
