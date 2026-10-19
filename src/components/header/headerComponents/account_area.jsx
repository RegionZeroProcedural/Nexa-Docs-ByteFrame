import React from 'react';
import ByteFrameDiscovery from './byteframe_discovery';

/** Browser-local workspace controls and discoverability for ByteFrame. */
export default function AccountArea({ onOpenFile }) {
  return (
    <div className="header-right">
      <ByteFrameDiscovery onOpenFile={onOpenFile} />
      <span className="local-pill"><span className="status-dot" /> Local draft</span>
      <div className="profile-orb" title="Local workspace" aria-label="Local workspace">N</div>
    </div>
  );
}
