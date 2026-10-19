import React, { useState } from 'react';
import DropdownChild from './dropdown_child';

/** One active flyout per menu level. Hovering another folder closes its sibling. */
export default function DropdownSection({ label, items, onAction, onKeepOpen }) {
  const [activeIndex, setActiveIndex] = useState(null);
  return <div className="dropdown-section" role="group" aria-label={label}>
    {items.map((item, index) => <DropdownChild
      key={`${item.label || 'divider'}-${index}`} item={item} onAction={onAction}
      expanded={index === activeIndex} onActivate={() => { setActiveIndex(index); onKeepOpen?.(); }}
      onDeactivate={() => setActiveIndex(current => current === index ? null : current)}
      onKeepOpen={onKeepOpen}
    />)}
  </div>;
}
