import React from 'react';

export default function DropdownChildKeys({ shortcut }) {
  return shortcut ? <span className="menu-shortcut">{shortcut}</span> : null;
}
