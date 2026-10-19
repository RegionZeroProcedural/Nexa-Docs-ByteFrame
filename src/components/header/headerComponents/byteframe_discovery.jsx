import React from 'react';

/** Compact header entry point for the optional, browser-local ByteFrame tools. */
export default function ByteFrameDiscovery({ onOpenFile }) {
  return (
    <button
      type="button"
      className="byteframe-discovery"
      onClick={onOpenFile}
      title="Open a binary file to inspect HEX, decode supported opcodes, or make reversible byte edits. You can also enable ByteFrame for a document from View."
      aria-label="ByteFrame: open a file to view and edit binary bytes or inspect HEX and opcodes"
    >
      <span className="byteframe-discovery-symbol" aria-hidden="true">01</span>
      <span className="byteframe-discovery-copy">
        <span className="byteframe-discovery-name">ByteFrame <span className="byteframe-discovery-tag">BUILT IN</span></span>
        <span className="byteframe-discovery-detail">View &amp; edit binaries · Inspect HEX &amp; opcodes</span>
      </span>
      <svg className="byteframe-discovery-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
