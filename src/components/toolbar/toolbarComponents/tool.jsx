import React from 'react';
import ToolIcon from './tool_icon';

/** Shared toolbar control. Preventing mousedown preserves editor selection. */
export default function Tool({ icon, label, onClick, disabled, active, children }) {
  return (
    <button type="button" className={`toolbar-button ${active ? 'is-active' : ''}`}
      onMouseDown={event => event.preventDefault()}
      onClick={onClick} title={label} aria-label={label}
      aria-pressed={active === undefined ? undefined : active} disabled={disabled}>
      {icon ? <ToolIcon name={icon} size={18} /> : children}
    </button>
  );
}
