import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

const FALLBACK_TITLE = 'Untitled document';

/**
 * Measures the actual rendered title glyphs instead of relying on a fixed-width
 * input or an overflowing CSS grid track. Flexbox is allowed to shrink this
 * measured width when there isn't room for the star and save indicator.
 */
export default function DocumentTitle({ title, onChange, readOnly = false }) {
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const measureRef = useRef(null);
  const previousTitleRef = useRef(title.trim() || FALLBACK_TITLE);
  const cancelledRef = useRef(false);

  const measureTitle = useCallback(() => {
    const container = containerRef.current;
    const input = inputRef.current;
    const measure = measureRef.current;
    if (!container || !input || !measure) return;

    // The invisible text and input share a font via CSS. Include input padding
    // and borders so its right edge follows the last rendered glyph precisely.
    const style = window.getComputedStyle(input);
    const edgeWidth = ['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth']
      .reduce((total, key) => total + (parseFloat(style[key]) || 0), 0);
    const glyphWidth = measure.getBoundingClientRect().width;
    const desiredWidth = Math.max(28, Math.ceil(glyphWidth + edgeWidth + 1));
    container.style.width = `${desiredWidth}px`;
  }, []);

  useLayoutEffect(() => {
    measureTitle();
  }, [title, measureTitle]);

  useEffect(() => {
    window.addEventListener('resize', measureTitle);
    // Recalculate when a web font becomes available after the first render.
    let mounted = true;
    if (document.fonts?.ready) document.fonts.ready.then(() => {
      if (mounted) measureTitle();
    });
    return () => {
      mounted = false;
      window.removeEventListener('resize', measureTitle);
    };
  }, [measureTitle]);

  const handleBlur = event => {
    if (!cancelledRef.current) {
      const trimmedTitle = title.trim();
      if (!trimmedTitle) onChange(previousTitleRef.current);
      else if (title !== trimmedTitle) onChange(trimmedTitle);
    }
    cancelledRef.current = false;
    // A long title may scroll internally while being typed. On leaving the
    // field, display its beginning instead of leaving the text offset leftward.
    event.currentTarget.scrollLeft = 0;
  };

  return (
    <span className="document-title-sizing" ref={containerRef}>
      <span className="document-title-measure" ref={measureRef} aria-hidden="true">
        {title || ' '}
      </span>
      <input
        ref={inputRef}
        className="document-title"
        type="text"
        readOnly={readOnly}
        maxLength={120}
        value={title}
        onChange={event => onChange(event.target.value)}
        onFocus={() => {
          previousTitleRef.current = title.trim() || FALLBACK_TITLE;
          cancelledRef.current = false;
        }}
        onBlur={handleBlur}
        onKeyDown={event => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            cancelledRef.current = true;
            onChange(previousTitleRef.current);
            event.currentTarget.blur();
          }
        }}
        aria-label="Document title"
        title="Rename document"
      />
    </span>
  );
}
