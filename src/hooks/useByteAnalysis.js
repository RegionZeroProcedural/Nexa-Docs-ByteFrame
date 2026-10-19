import { useEffect, useMemo, useState } from 'react';
import { analyzeByteText } from '../byteframe/core/byteAnalysis';

// Large documents can contain thousands of hex tokens. Running disassembly
// regexes synchronously on every keystroke blocks the main browser thread.
// Short snippets stay instant; large inputs are analyzed after typing settles.
export const BYTE_ANALYSIS_IMMEDIATE_LIMIT = 2048;
export const BYTE_ANALYSIS_IDLE_DELAY = 260;

export default function useByteAnalysis(text, enabled) {
  const shortText = enabled && text.length <= BYTE_ANALYSIS_IMMEDIATE_LIMIT;
  const immediate = useMemo(() => shortText ? analyzeByteText(text) : null, [text, shortText]);
  const [delayed, setDelayed] = useState(null);
  useEffect(() => {
    if (!enabled || shortText) return undefined;
    const timer = setTimeout(() => {
      const result = analyzeByteText(text);
      setDelayed({ text, analysis: result });
    }, BYTE_ANALYSIS_IDLE_DELAY);
    return () => clearTimeout(timer);
  }, [enabled, shortText, text]);
  if (!enabled) return null;
  if (shortText) return immediate;
  // Never show stale positions while the user is editing. In the idle gap the
  // plain text remains fully editable; colorization returns automatically.
  return delayed?.text === text ? delayed.analysis : null;
}
