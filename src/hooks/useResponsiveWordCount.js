import { useEffect, useMemo, useState } from 'react';
import { getWordCount } from '../editorCore/documentModel';

const LARGE_DOCUMENT = 48000;
/** Counts update immediately for typical documents, after an idle pause for
 * large ones. This keeps allocating a giant split() array off the typing path.
 */
export default function useResponsiveWordCount(text) {
  const large = text.length > LARGE_DOCUMENT;
  const immediate = useMemo(() => large ? null : getWordCount(text), [large, text]);
  const [delayed, setDelayed] = useState(0);
  useEffect(() => {
    if (!large) return undefined;
    const timer = setTimeout(() => setDelayed(getWordCount(text)), 360);
    return () => clearTimeout(timer);
  }, [large, text]);
  return large ? delayed : immediate;
}
