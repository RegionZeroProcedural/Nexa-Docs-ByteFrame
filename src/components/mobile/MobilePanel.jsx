import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Respond to viewport changes without pinning the editor to a desktop width. */
export function useMobileViewport(breakpoint = 760) {
  const [size, setSize] = useState(() => ({
    mobile: typeof window !== 'undefined' && window.innerWidth <= breakpoint,
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
  }));
  useEffect(() => {
    const update = () => setSize({ mobile: window.innerWidth <= breakpoint, width: window.innerWidth });
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, [breakpoint]);
  return size;
}

/** Mobile-only overlay. The real inspector stays mounted inside this accessible drawer. */
export default function MobilePanel({ open, title, side = 'right', onClose, children }) {
  const closeRef = useRef(null);
  const previousFocus = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    previousFocus.current = document.activeElement;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = event => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = oldOverflow;
      window.removeEventListener('keydown', onKey);
      if (previousFocus.current?.isConnected) previousFocus.current.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(<div className="mobile-drawer-overlay">
    <button className="mobile-drawer-scrim" type="button" aria-label={`Close ${title}`} onClick={onClose} />
    <section className={`mobile-drawer mobile-drawer-${side}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className="mobile-drawer-head"><strong>{title}</strong>
        <button ref={closeRef} type="button" onClick={onClose} aria-label={`Close ${title}`}>×</button>
      </div>
      <div className="mobile-drawer-content">{children}</div>
    </section>
  </div>, document.body);
}
