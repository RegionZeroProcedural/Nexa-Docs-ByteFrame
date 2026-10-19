import React from 'react';
import ToolIcon from '../../toolbar/toolbarComponents/tool_icon';

export default function DropdownChildIcon({ name }) {
  return <span className="menu-item-icon" aria-hidden="true">{name && <ToolIcon name={name} size={15} />}</span>;
}
