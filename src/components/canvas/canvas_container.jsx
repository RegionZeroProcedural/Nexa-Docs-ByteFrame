import React from 'react';
import CanvasPage from './canvas_page';
import DocumentOutline from './document_outline';
export default function CanvasContainer({ editor, zoom, view }) {
  return <main className="workspace" aria-label="Editor workspace">
    <div className="canvas-scroll">{view.showOutline && <DocumentOutline editor={editor} onClose={() => view.setShowOutline(false)} />}<CanvasPage editor={editor} zoom={zoom} view={view} /></div>
  </main>;
}
