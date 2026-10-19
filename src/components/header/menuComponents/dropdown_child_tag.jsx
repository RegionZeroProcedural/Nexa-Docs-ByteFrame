import React from 'react';

export default function DropdownChildTag({ tag }) {
  return tag ? <span className="menu-item-tag">{tag}</span> : null;
}
