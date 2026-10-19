import React from 'react';

/** Selection/caret position readout; the actual caret stays browser-native. */
export default function Cursor({ text, selection }) {
  const focus = Math.max(0, Math.min(text.length, selection?.focus ?? 0));
  const prefix = text.slice(0, focus);
  const line = prefix.split('\n').length;
  const column = focus - prefix.lastIndexOf('\n');
  const selected = (selection?.end ?? 0) - (selection?.start ?? 0);

  return (
    <span className="cursor-position" title="Caret position (UTF-16 code units)">
      Ln {line}, Col {column}{selected > 0 ? ` · ${selected} selected` : ''}
    </span>
  );
}
