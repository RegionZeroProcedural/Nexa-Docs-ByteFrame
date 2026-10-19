import React from 'react';
import NexaDocsIcon from './headerComponents/nexa_docs_icon';
import DocumentTitle from './headerComponents/document_title';
import DocumentExtension from './headerComponents/document_extension';
import DocumentFavorite from './headerComponents/document_favorite';
import Menu from './headerComponents/menu';
import AccountArea from './headerComponents/account_area';
import ToolIcon from '../toolbar/toolbarComponents/tool_icon';

/** Layout and document-level actions live here; dropdown UI is delegated to Menu. */
export default function Header({ doc, saveStatus, readOnlyPreview = false, onTitleChange, onExtensionChange, onFavorite, groups, fileRef, onOpenFile }) {


  // Menu data is prepared by the editor and rendered using the existing
  // Menu → DropdownFolder → DropdownSection → DropdownChild hierarchy.


  return (
    <header className="nexa-header">
      <div className="header-main">
        <div className="header-identification">
          <NexaDocsIcon />
          <div className="title-stack">
            <div className="title-row">
              <DocumentTitle title={doc.title} onChange={onTitleChange} readOnly={readOnlyPreview} />
              <DocumentExtension extension={doc.extension || '.txt'} onChange={onExtensionChange} readOnly={readOnlyPreview} />
              <DocumentFavorite favorite={doc.favorite} onToggle={onFavorite} disabled={readOnlyPreview} />
              <span className="saved-indicator" title="Draft is stored in this browser, not in the cloud"><ToolIcon name="cloud" size={15} />{saveStatus}</span>
            </div>
            <Menu groups={groups} />
          </div>
        </div>
        <AccountArea onOpenFile={() => fileRef.current?.click()} />
      </div>
      <input ref={fileRef} hidden type="file"
        onChange={async e => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          if (!window.confirm('Open this file? Editable documents replace the current draft. Binary files open in ByteFrame for byte inspection and reversible edits without replacing your draft.')) return;
          try { await onOpenFile(file); } catch (error) { window.alert(error?.message || 'This file could not be opened.'); }
        }} />
    </header>
  );
}
