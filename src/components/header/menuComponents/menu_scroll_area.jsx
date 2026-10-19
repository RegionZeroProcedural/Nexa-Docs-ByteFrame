import React, { useCallback, useEffect, useRef, useState } from 'react';

/** Native wheel/touch scrolling with a non-interactive, auto-fading left-side thumb.
 * The scrollbar does not occupy a hoverable gutter beside submenu triggers. */
export default function MenuScrollArea({ children, className = '' }) {
  const scrollRef = useRef(null);
  const fadeTimer = useRef(null);
  const [thumb, setThumb] = useState({ visible: false, top: 0, height: 0, needed: false });
  const update = useCallback((show = false) => {
    const element = scrollRef.current;
    if (!element) return;
    const { clientHeight, scrollHeight, scrollTop } = element;
    const needed = scrollHeight > clientHeight + 2;
    const height = needed ? Math.max(22, clientHeight * clientHeight / scrollHeight) : 0;
    const top = needed ? (scrollTop / (scrollHeight - clientHeight)) * (clientHeight - height) : 0;
    setThumb(previous => ({ needed, height, top, visible: needed && (show || previous.visible) }));
  }, []);
  useEffect(() => {
    update();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => update()) : null;
    if (ro && scrollRef.current) ro.observe(scrollRef.current);
    return () => { ro?.disconnect(); clearTimeout(fadeTimer.current); };
  }, [update]);
  const onScroll = () => {
    update(true);
    clearTimeout(fadeTimer.current);
    fadeTimer.current = setTimeout(() => setThumb(t => ({ ...t, visible: false })), 950);
  };
  return <div className={`menu-scroll-shell ${className}`}>
    <div ref={scrollRef} className="menu-scroll-content" onScroll={onScroll} onWheel={onScroll}>
      {children}
    </div>
    {thumb.needed && <span aria-hidden="true" className={`menu-scroll-pill ${thumb.visible ? 'is-visible' : ''}`}
      style={{ top: `${thumb.top}px`, height: `${thumb.height}px` }} />}
  </div>;
}
