import React, { useEffect, useRef, useState } from 'react';
import { normalizeExtension } from '../../../editorCore/fileExtension';

/** The extension is edited separately, so renaming a document never damages it. */
export default function DocumentExtension({ extension = '.txt', onChange, readOnly = false }) {
  const [draft, setDraft] = useState(extension);
  const oldValue = useRef(extension);
  const cancelling = useRef(false);
  useEffect(() => { setDraft(extension); }, [extension]);
  const finish = () => {
    if (cancelling.current) { cancelling.current = false; setDraft(oldValue.current); return; }
    const next = normalizeExtension(draft);
    if (!next) { setDraft(oldValue.current); return; }
    setDraft(next);
    if (next !== extension) onChange(next);
  };
  return <input className="document-extension" type="text" readOnly={readOnly} maxLength={13} value={draft}
    style={{ width: `${Math.max(4, Math.min(14, draft.length + 0.65))}ch` }}
    aria-label="File extension" title="File extension"
    spellCheck={false} autoComplete="off"
    onChange={event => setDraft(event.target.value)}
    onFocus={() => { oldValue.current = extension; cancelling.current = false; }}
    onBlur={finish}
    onKeyDown={event => {
      if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
      if (event.key === 'Escape') { event.preventDefault(); cancelling.current = true; event.currentTarget.blur(); }
    }} />;
}
