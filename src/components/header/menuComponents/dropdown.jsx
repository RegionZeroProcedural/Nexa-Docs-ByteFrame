import React from 'react';
import DropdownSection from './dropdown_section';
import MenuScrollArea from './menu_scroll_area';

export default function Dropdown({ id, label, items, onAction }) {
  return <div id={id} className="menu-popover" role="menu" aria-label={`${label} menu`}>
    <MenuScrollArea><DropdownSection label={`${label} actions`} items={items} onAction={onAction} /></MenuScrollArea>
  </div>;
}
