import React from 'react';
import ToolIcon from './tool_icon';
/** Only hides the title/menu header ABOVE the formatting toolbar. */
export default function CollapseHeader({ collapsed, onToggle }) {
  return <button type="button" className="toolbar-collapse-toggle"
    onMouseDown={event => event.preventDefault()} onClick={onToggle}
    aria-expanded={!collapsed} aria-controls="nexa-document-header"
    title={collapsed ? 'Show document header' : 'Hide document header'}
    aria-label={collapsed ? 'Show document header' : 'Hide document header'}>
    <ToolIcon name={collapsed ? 'chevronDown' : 'chevronUp'} size={17} />
  </button>;
}
