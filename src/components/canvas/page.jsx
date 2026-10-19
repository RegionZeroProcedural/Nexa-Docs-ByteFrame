import React from 'react';
import ParagraphFragment from './paragraph_fragment';

/** Displays only the fragments assigned to this visual sheet. Editing is hosted
 * by one shared contentEditable ancestor across all sheets, not per page. */
export default function Page({ doc, fragments = [], columns, onChecklist, byteAnalysis = null, listNumbers = [], columnCount = 1 }) {
  const filled = columns || [{ fragments }];
  // Keep final partial pages at the same column width as earlier pages.
  const showColumns = columnCount > 1
    ? Array.from({ length: columnCount }, (_, index) => filled[index] || { fragments: [] })
    : filled;
  const renderFragments = pieces => pieces.map((part, index) => {
      const p = doc.paragraphs?.[part.lineIndex];
      const marker = p?.list === 'number' ? `${listNumbers[part.lineIndex] || 1}.` : p?.list === 'bullet' ? '•' : undefined;
      return <ParagraphFragment key={`${part.lineIndex}:${part.start}:${index}`}
        doc={doc} part={{ ...part, marker }} onChecklist={onChecklist} byteAnalysis={byteAnalysis} />;
    });
  return <div className={`page-content ${showColumns.length > 1 ? 'nexa-page-columns' : ''}`} data-page-content>
    {showColumns.map((slot, ci) => <div className="nexa-page-column" key={ci}>{renderFragments(slot.fragments)}</div>)}
  </div>;
}
