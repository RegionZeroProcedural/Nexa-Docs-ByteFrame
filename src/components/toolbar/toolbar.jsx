import React, { useEffect, useRef, useState } from 'react';
import Tool from './toolbarComponents/tool';
import ToolIcon from './toolbarComponents/tool_icon';
import ToolbarDropdown, { DropdownOption } from './toolbarComponents/toolbar_dropdown';
import CollapseHeader from './toolbarComponents/collapse_header';

const FONTS = ['Arial', 'Calibri', 'Georgia', 'Times New Roman', 'Verdana', 'Trebuchet MS', 'Courier New', 'Monospace'];
const STYLES = [{ value: 'normal', label: 'Normal text' }, { value: 'title', label: 'Title' }, { value: 'subtitle', label: 'Subtitle' }, { value: 'h1', label: 'Heading 1' }, { value: 'h2', label: 'Heading 2' }, { value: 'h3', label: 'Heading 3' }];
const COLORS = ['#000000', '#444444', '#777777', '#e53935', '#e67e22', '#f5c842', '#0f9d58', '#16859c', '#1a73e8', '#8052be', '#ffffff'];
function ColorPicker({ label, icon, current, onChange, highlight = false, disabled }) {
  const [open, setOpen] = useState(false);
  const customRef = useRef(null);
  return <div className="color-picker">
    <Tool label={label} disabled={disabled} onClick={() => setOpen(v => !v)}>
      <span className="color-picker-icon"><ToolIcon name={icon} size={18} />
        <span className="color-picker-swatch" style={{ background: current || (highlight ? '#fff58a' : '#000') }} /></span>
    </Tool>
    {open && <div className="color-popover">
      <strong>{label}</strong><div className="color-grid">{COLORS.map(color => <button key={color} type="button" title={color}
        className={`color-chip ${current === color ? 'picked-color' : ''}`} style={{ background: color }}
        onMouseDown={e => e.preventDefault()} onClick={() => { onChange(color); setOpen(false); }} />)}</div>
      {highlight && <button className="color-clear" type="button" onMouseDown={e => e.preventDefault()} onClick={() => { onChange(null); setOpen(false); }}>Remove highlight</button>}
      <button className="color-clear" type="button" onMouseDown={e => e.preventDefault()} onClick={() => customRef.current?.click()}>Custom color…</button>
      <input ref={customRef} aria-label="Custom color" type="color" className="color-hidden" onChange={e => { onChange(e.target.value); setOpen(false); }} />
    </div>}
  </div>;
}

export default function Toolbar({ editor, zoom, setZoom, headerCollapsed, toggleHeader, onPrint, onAddComment }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [searchNotice, setSearchNotice] = useState('');
  const searchRootRef = useRef(null);
  const imageRef = useRef(null);

  // Match the document menus: clicking anywhere outside Search closes it,
  // including the canvas, other tool buttons, and other popovers.
  useEffect(() => {
    if (!searchOpen) return undefined;
    const closeOutside = (event) => {
      if (!searchRootRef.current?.contains(event.target)) setSearchOpen(false);
    };
    const closeEscape = (event) => {
      if (event.key === 'Escape') setSearchOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeEscape);
    };
  }, [searchOpen]);
  const size = Math.max(8, Math.min(72, Number(editor.activeValue('size', 11)) || 11));
  const family = editor.activeValue('font', 'Arial');
  const isView = editor.editMode !== 'editing';
  const commands = [
    { label: 'Undo', action: editor.undo }, { label: 'Redo', action: editor.redo },
    { label: 'Bold', action: () => editor.toggleFormat('bold') }, { label: 'Italic', action: () => editor.toggleFormat('italic') },
    { label: 'Underline', action: () => editor.toggleFormat('underline') },
    { label: 'Insert link', action: editor.addLink }, { label: 'Add comment', action: onAddComment || editor.addComment },
    { label: 'Insert image', action: () => imageRef.current?.click() },
    { label: 'Clear formatting', action: editor.clearFormatting },
    { label: 'Find text in document…', action: () => { const value = window.prompt('Find text:'); if (value && !editor.findText(value)) window.alert('No matching text found.'); } },
    { label: 'Print document', action: onPrint },
  ];
  const runSearch = () => {
    if (!search.trim()) return;
    const cmd = commands.find(c => c.label.toLowerCase().includes(search.trim().toLowerCase()));
    if (cmd) { cmd.action(); setSearchOpen(false); setSearchNotice(''); }
    else setSearchNotice(editor.findText(search) ? 'Found in document.' : 'No matching command or document text.');
  };
  return <div className="toolbar-area">
    <div id="nexa-format-toolbar" className="toolbar" role="toolbar" aria-label="Document formatting">
      <div className="toolbar-search-container" ref={searchRootRef}>
        <button type="button" className="toolbar-search-trigger" title="Search menus and document" aria-expanded={searchOpen}
          onMouseDown={e => e.preventDefault()} onClick={() => setSearchOpen(v => !v)}><ToolIcon name="search" size={17} /> <span>Menus</span></button>
        {searchOpen && <div className="toolbar-search-popover">
          <input autoFocus placeholder="Search menus or document…" aria-label="Search menus or document" value={search}
            onKeyDown={e => { if (e.key === 'Enter') runSearch(); if (e.key === 'Escape') setSearchOpen(false); }}
            onChange={e => { setSearch(e.target.value); setSearchNotice(''); }} />
          <div className="toolbar-search-options">{commands.filter(c => c.label.toLowerCase().includes(search.toLowerCase())).slice(0, 7).map(c =>
            <button key={c.label} onMouseDown={e => e.preventDefault()} onClick={() => { c.action(); setSearchOpen(false); }}>{c.label}</button>)}</div>
          {searchNotice && <small>{searchNotice}</small>}
          <button className="search-find" onMouseDown={e => e.preventDefault()} onClick={runSearch}>Run / find “{search}”</button>
        </div>}
      </div>
      <div className="toolbar-cluster">
        <Tool icon="undo" label="Undo (Ctrl+Z)" onClick={editor.undo} disabled={!editor.historyAvailability.undo || isView} />
        <Tool icon="redo" label="Redo (Ctrl+Y)" onClick={editor.redo} disabled={!editor.historyAvailability.redo || isView} />
        <Tool icon="print" label="Print document" onClick={onPrint} />
        <Tool icon="spelling" label={editor.spellcheck ? 'Disable browser spellcheck' : 'Enable browser spellcheck'} onClick={() => editor.setSpellcheck(v => !v)} active={editor.spellcheck} />
        <Tool icon="paint" label="Paint format: copy selected text formatting, then select a destination" active={editor.paintActive} onClick={editor.togglePaint} disabled={isView} />
      </div>
      <span className="toolbar-divider" />
      <ToolbarDropdown label="Zoom level" value={`${zoom}%`}>
        {[50, 75, 90, 100, 110, 125, 150, 200].map(x => <DropdownOption key={x} selected={x === zoom} onClick={() => setZoom(x)}>{x}%</DropdownOption>)}
      </ToolbarDropdown>
      <span className="toolbar-divider" />
      <ToolbarDropdown label="Paragraph style" value={STYLES.find(s => s.value === editor.activeParagraph.style)?.label || 'Normal text'} disabled={isView} wide>
        {STYLES.map(s => <DropdownOption key={s.value} selected={s.value === editor.activeParagraph.style} onClick={() => editor.changeParagraph('style', s.value)}>{s.label}</DropdownOption>)}
      </ToolbarDropdown>
      <span className="toolbar-divider" />
      <ToolbarDropdown label="Font family" value={family} disabled={isView} wide>
        {FONTS.map(font => <DropdownOption key={font} selected={font === family} onClick={() => editor.setTextAttribute('font', font)}><span style={{ fontFamily: font }}>{font}</span></DropdownOption>)}
      </ToolbarDropdown>
      <span className="toolbar-divider" />
      <div className="toolbar-cluster font-size-cluster">
        <Tool icon="minus" label="Decrease font size" disabled={isView || size <= 8} onClick={() => editor.setTextAttribute('size', Math.max(8, size - 1))} />
        <input className="font-size-input" title="Font size" type="number" min="8" max="72" value={size} disabled={isView}
          onChange={e => { const n = Number(e.target.value); if (n >= 8 && n <= 72) editor.setTextAttribute('size', n); }} />
        <Tool icon="plus" label="Increase font size" disabled={isView || size >= 72} onClick={() => editor.setTextAttribute('size', Math.min(72, size + 1))} />
      </div>
      <span className="toolbar-divider" />
      <div className="toolbar-cluster">
        <Tool label="Bold (Ctrl+B)" disabled={isView} active={editor.activeMarks.includes('bold')} onClick={() => editor.toggleFormat('bold')}><strong className="format-letter">B</strong></Tool>
        <Tool label="Italic (Ctrl+I)" disabled={isView} active={editor.activeMarks.includes('italic')} onClick={() => editor.toggleFormat('italic')}><em className="format-letter">I</em></Tool>
        <Tool label="Underline (Ctrl+U)" disabled={isView} active={editor.activeMarks.includes('underline')} onClick={() => editor.toggleFormat('underline')}><u className="format-letter">U</u></Tool>
        <ColorPicker label="Text color" icon="textColor" current={editor.activeValue('color', '#000000')} onChange={v => editor.setTextAttribute('color', v)} disabled={isView} />
        <ColorPicker label="Highlight color" icon="highlight" current={editor.activeValue('highlight', '#fff58a')} onChange={v => editor.setTextAttribute('highlight', v)} highlight disabled={isView} />
      </div>
      <span className="toolbar-divider" />
      <div className="toolbar-cluster">
        <Tool icon="link" label="Insert or edit link (Ctrl+K)" onClick={editor.addLink} disabled={isView} />
        <Tool icon="comment" label="Add comment to selection" onClick={onAddComment || editor.addComment} disabled={isView} />
        <Tool icon="image" label="Insert image" disabled={isView} onClick={() => imageRef.current?.click()} />
        <input ref={imageRef} hidden type="file" accept="image/*" onChange={e => { editor.insertImage(e.target.files?.[0]); e.target.value = ''; }} />
      </div>
      <span className="toolbar-divider" />
      <ToolbarDropdown label="Text alignment" icon={{ left: 'alignLeft', center: 'alignCenter', right: 'alignRight', justify: 'justify' }[editor.activeParagraph.align]} disabled={isView}>
        {[['left', 'Align left'], ['center', 'Center'], ['right', 'Align right'], ['justify', 'Justify']].map(([val, label]) =>
          <DropdownOption key={val} selected={editor.activeParagraph.align === val} icon={val === 'justify' ? 'justify' : `align${val.charAt(0).toUpperCase()}${val.slice(1)}`} onClick={() => editor.changeParagraph('align', val)}>{label}</DropdownOption>)}
      </ToolbarDropdown>
      <ToolbarDropdown label="Line spacing" icon="spacing" disabled={isView}>
        {[1, 1.15, 1.5, 2].map(v => <DropdownOption key={v} selected={editor.activeParagraph.spacing === v} onClick={() => editor.changeParagraph('spacing', v)}>{v === 1 ? 'Single' : `${v} lines`}</DropdownOption>)}
      </ToolbarDropdown>
      <div className="toolbar-cluster">
        <Tool icon="checklist" label="Toggle checklist" disabled={isView} active={editor.activeParagraph.list === 'checklist'} onClick={() => editor.changeParagraph('list', editor.activeParagraph.list === 'checklist' ? 'none' : 'checklist')} />
        <ToolbarDropdown label="Bulleted list" icon="bullet" disabled={isView}>
          <DropdownOption selected={editor.activeParagraph.list === 'bullet'} onClick={() => editor.changeParagraph('list', editor.activeParagraph.list === 'bullet' ? 'none' : 'bullet')}>Bulleted list</DropdownOption>
          <DropdownOption onClick={() => editor.changeParagraph('list', 'none')}>No list</DropdownOption>
        </ToolbarDropdown>
        <ToolbarDropdown label="Numbered list" icon="number" disabled={isView}>
          <DropdownOption selected={editor.activeParagraph.list === 'number'} onClick={() => editor.changeParagraph('list', editor.activeParagraph.list === 'number' ? 'none' : 'number')}>Numbered list</DropdownOption>
          <DropdownOption onClick={() => editor.changeParagraph('list', 'none')}>No list</DropdownOption>
        </ToolbarDropdown>
      </div>
      <span className="toolbar-divider" />
      <div className="toolbar-cluster">
        <Tool icon="indentLess" label="Decrease indent" disabled={isView} onClick={() => editor.changeIndent(-1)} />
        <Tool icon="indentMore" label="Increase indent" disabled={isView} onClick={() => editor.changeIndent(1)} />
        <Tool icon="clear" label="Clear formatting" disabled={isView} onClick={editor.clearFormatting} />
      </div>
      <div className="toolbar-spacer" />
      <ToolbarDropdown label="Editor mode" icon={isView ? 'eye' : 'edit'} value={isView ? 'Viewing' : 'Editing'} className="editing-dropdown">
        <DropdownOption selected={!isView} icon="edit" onClick={() => editor.setEditMode('editing')}>Editing</DropdownOption>
        <DropdownOption selected={isView} icon="eye" onClick={() => editor.setEditMode('viewing')}>Viewing (read-only)</DropdownOption>
      </ToolbarDropdown>
    </div>
    <CollapseHeader collapsed={headerCollapsed} onToggle={toggleHeader} />
  </div>;
}
