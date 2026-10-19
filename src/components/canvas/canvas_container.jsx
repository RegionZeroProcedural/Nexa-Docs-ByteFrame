import React, { useCallback, useEffect, useState } from 'react';
import CanvasPage from './canvas_page';
import DocumentOutline from './document_outline';
import MobilePanel, { useMobileViewport } from '../mobile/MobilePanel';

export default function CanvasContainer({ editor, zoom, view }) {
  const viewport = useMobileViewport();
  const [mobilePanel, setMobilePanel] = useState(null);
  const closePanel = useCallback(() => setMobilePanel(null), []);
  useEffect(() => { if (!viewport.mobile) setMobilePanel(null); }, [viewport.mobile]);

  return <main className={`workspace ${viewport.mobile ? 'workspace-mobile' : ''}`} aria-label="Editor workspace">
    {viewport.mobile && <nav className="mobile-workspace-actions" aria-label="Document side panels">
      <button type="button" aria-expanded={mobilePanel === 'outline'} onClick={() => { view.setShowOutline(true); setMobilePanel('outline'); }}>☷ Outline</button>
      <button type="button" aria-expanded={mobilePanel === 'comments'} onClick={() => { view.setShowComments(true); setMobilePanel('comments'); }}>▤ Comments{editor.doc.comments?.length ? ` (${editor.doc.comments.length})` : ''}</button>
      <button type="button" aria-expanded={mobilePanel === 'byteframe'} onClick={() => { view.setShowByteFrame(true); setMobilePanel('byteframe'); }}>◈ ByteFrame</button>
    </nav>}
    <div className="canvas-scroll">
      {view.showOutline && (viewport.mobile
        ? <MobilePanel open={mobilePanel === 'outline'} side="left" title="Document outline" onClose={closePanel}>
          <DocumentOutline editor={editor} onClose={closePanel} />
        </MobilePanel>
        : <DocumentOutline editor={editor} onClose={() => view.setShowOutline(false)} />)}
      <CanvasPage editor={editor} zoom={zoom} view={view} viewport={viewport}
        mobilePanel={mobilePanel} onMobilePanelClose={closePanel} />
    </div>
  </main>;
}
