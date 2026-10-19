/** Browser-first Nexa Docs menu definitions. No cloud-only item pretends to work. */
const item = (label, action, extra = {}) => ({ label, action, ...extra });
const sep = () => ({ separator: true });
const unavailable = (label, reason = 'Requires Nexora cloud services or a future editor subsystem.') =>
  item(label, null, { disabled: true, reason });
const submenu = (label, children, extra = {}) => ({ label, children, ...extra });
const popup = (view, name) => () => view.setDialog(name);
const toggle = (getter, setter) => () => setter(!getter);

export default function buildMenus(editor, view, refs) {
  const editing = editor.editMode === 'editing' && !view.binaryFile;
  const editItem = (label, action, extra = {}) => editing
    ? item(label, action, extra.disabled && !extra.reason ? { ...extra, reason: 'Select document text first.' } : extra)
    : unavailable(label, 'Switch to Editing mode to modify the document.');
  const text = value => editor.insertAtSelection(value);
  const image = () => refs.imageRef.current?.click();
  const selected = editor.selectedText();
  const find = popup(view, 'find');
  const dialog = name => popup(view, name);
  const mode = value => () => editor.setEditMode(value);
  const actionFormat = (label, fn) => editItem(label, fn);
  const setList = value => () => editor.changeParagraph('list', value);
  
  return [
    { label: 'File', items: [
      submenu('New', [view.binaryFile ? unavailable('Blank document', 'Close the binary preview before creating a new text document.') : item('Blank document', editor.newDocument),
        view.binaryFile ? unavailable('From a local snapshot…', 'Close the binary preview first.') : item('From a local snapshot…', dialog('library')),
        item('From template…', dialog('templates'))], { icon: 'file' }),
      item('Open', () => refs.openFile(), { icon: 'folder', shortcut: 'Ctrl+O' }),
      view.binaryFile ? unavailable('Make a copy', 'Close the binary preview; use Download to copy the current binary.') : item('Make a copy', editor.makeCopy, { icon: 'copy' }),
      view.binaryFile ? unavailable('Save draft locally', 'Use Download → Original extension to export edited bytes.') : item('Save locally', () => editor.saveNow(), { icon: 'save', shortcut: 'Ctrl+S' }), sep(),
      submenu('Share', [unavailable('Share with people', 'Nexora accounts and cloud sharing are not implemented.'),
        unavailable('Publish to web', 'Publishing requires Nexora hosting.')], { icon: 'share' }),
      submenu('Email', [item('Send text via email application', () => {
        const subject = encodeURIComponent(editor.doc.title);
        const body = encodeURIComponent(editor.doc.text.slice(0, 1400));
        window.location.href = `mailto:?subject=${subject}&body=${body}`;
      }), unavailable('Email as attachment', 'Sending email attachments requires an email provider integration.')], { icon: 'mail' }),
      submenu('Download', view.binaryFile
        ? [item('Original filename and extension (edited bytes)', () => refs.downloadOriginalExtension?.())]
        : [item(`Original extension (${editor.doc.extension || '.txt'}) — plain text`, () => editor.exportDocument('original')),
          item('Plain text (.txt)', () => editor.exportDocument('txt')),
          item('Nexa document backup (.nexa.json)', () => editor.exportDocument('json')),
          item('Web page (.html)', () => editor.exportDocument('html')),
          item('Markdown (.md) — plain text', () => editor.exportDocument('markdown')),
          item('PDF — Print / Save as PDF', () => window.print())], { icon: 'download' }),
      item('Record video', dialog('record'), { icon: 'video' }), sep(),
      view.binaryFile ? unavailable('Rename draft', 'Close the binary preview first.') : item('Rename', () => view.setDialog('rename'), { icon: 'edit' }),
      view.binaryFile ? unavailable('Move draft to trash', 'Close the binary preview first.') : item('Move to trash', editor.trashDocument, { icon: 'delete' }),
      sep(), view.binaryFile ? unavailable('Save snapshot locally', 'Close the binary preview first.') : item('Save snapshot locally', () => { if (editor.saveSnapshot()) window.alert('Snapshot saved to this browser. Find it under File → Open.'); }, { icon: 'save' }),
      view.binaryFile ? unavailable('Open local snapshots', 'Close the binary preview first.') : item('Open local snapshots', dialog('library'), { icon: 'folder' }),
      view.binaryFile ? unavailable('Local version history', 'Close the binary preview first.') : item('Local version history', dialog('library'), { icon: 'save' }),
      unavailable('Make available offline', 'The public offline app shell and service worker have not been implemented; local snapshots work only after the app has loaded.'), sep(),
      item('Details', dialog('details'), { icon: 'file' }),
      item('Security & storage limitations', dialog('privacy')),
      submenu('Language', ['English (United States)', 'English (United Kingdom)', 'Spanish', 'French', 'German'].map(label => item(label, () => view.setLanguage(label), { checked: view.language === label })), { icon: 'globe' }),
      view.binaryFile ? unavailable('Page setup', 'Close the binary preview first.') : item('Page setup', dialog('page'), { icon: 'page' }),
      item('Print', () => window.print(), { icon: 'print', shortcut: 'Ctrl+P' }),
    ] },
    { label: 'Edit', items: [
      item('Undo', editor.undo, { icon: 'undo', shortcut: 'Ctrl+Z', disabled: view.binaryFile || !editor.historyAvailability.undo, reason: view.binaryFile ? 'Binary byte edits have separate controls in ByteFrame.' : 'No document operation to undo.' }),
      item('Redo', editor.redo, { icon: 'redo', shortcut: 'Ctrl+Y', disabled: view.binaryFile || !editor.historyAvailability.redo, reason: view.binaryFile ? 'Binary byte edits have separate controls in ByteFrame.' : 'No document operation to redo.' }), sep(),
      editItem('Cut', () => editor.clipboardCopy(true), { icon: 'cut', shortcut: 'Ctrl+X', disabled: !selected }),
      item('Copy', () => editor.clipboardCopy(false), { icon: 'copy', shortcut: 'Ctrl+C', disabled: view.binaryFile || !selected, reason: 'Select text in the document first.' }),
      editItem('Paste', () => editor.clipboardPaste(), { icon: 'clipboard', shortcut: 'Ctrl+V' }),
      editItem('Paste without formatting', () => editor.clipboardPaste(true), { icon: 'clipboard', shortcut: 'Ctrl+Shift+V' }),
      sep(), view.binaryFile ? unavailable('Select all', 'Select bytes directly in ByteFrame.') : item('Select all', editor.selectAll, { icon: 'selection', shortcut: 'Ctrl+A' }),
      editItem('Delete selection', editor.deleteSelection, { icon: 'delete', disabled: !selected }), sep(),
      item('Find and replace', find, { icon: 'search', shortcut: 'Ctrl+H' }),
    ] },
    { label: 'View', items: [
      submenu('Mode', [view.binaryFile ? unavailable('Editing', 'Binary files are edited in ByteFrame, without changing the text draft.') : item('Editing', mode('editing'), { checked: editing }), item('Viewing', mode('viewing'), { checked: !editing })], { icon: 'edit' }),
      submenu('Comments', [item('Show comments', () => view.setShowComments(true), { checked: view.showComments }),
        item('Hide comments', () => view.setShowComments(false), { checked: !view.showComments }),
        item('Show resolved comments', toggle(view.showResolved, view.setShowResolved), { checked: view.showResolved })], { icon: 'comment' }),
      item('ByteFrame analysis panel', toggle(view.showByteFrame, view.setShowByteFrame), { checked: view.showByteFrame }),
      item('Show document outline', toggle(view.showOutline, view.setShowOutline), { checked: view.showOutline, icon: 'list' }), sep(),
      item('Show print layout', toggle(view.printLayout, view.setPrintLayout), { checked: view.printLayout, icon: 'page' }),
      item('Show ruler', toggle(view.showRuler, view.setShowRuler), { checked: view.showRuler, icon: 'ruler' }),
      item('Show equation toolbar', toggle(view.showEquation, view.setShowEquation), { checked: view.showEquation }),
      item('Show non-printing characters', toggle(view.showNonPrinting, view.setShowNonPrinting), { checked: view.showNonPrinting, shortcut: 'Ctrl+Shift+P' }), sep(),
      item('Full screen', () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => window.alert('Full screen is unavailable in this browser.')); }, { icon: 'expand' }),
    ] },
    { label: 'Insert', items: [
      submenu('Image', [editItem('Upload from computer…', image), unavailable('From Drive', 'Cloud Drive is not integrated.'), unavailable('Search the web', 'Image search is not integrated.')], { icon: 'image' }),
      editItem('Table…', dialog('table')),
      submenu('Building blocks', [editItem('Meeting notes', () => text('Meeting notes\nDate: \nAttendees: \nAgenda: \nActions: \n')), editItem('Project brief', () => text('Project brief\nObjective: \nScope: \nMilestones: \nOwner: \n')), editItem('Checklist template', () => text('Checklist\n[ ] Task one\n[ ] Task two\n'))]),
      submenu('Document fields', [editItem('Current date', () => text(new Date().toLocaleDateString())), editItem('Document name', () => text(editor.doc.title)), editItem('Selected text length', () => text(String(selected.length)))]),
      editItem('Visual signature (not verified)…', dialog('signature')),
      editItem('Link', editor.addLink, { icon: 'link', shortcut: 'Ctrl+K' }),
      editItem('Drawing…', dialog('drawing')),
      editItem('Chart…', dialog('chart')),
      submenu('Symbols', [editItem('Insert special character…', dialog('symbols')), editItem('Insert em dash —', () => text('—')),
        editItem('Insert copyright ©', () => text('©')), editItem('Insert arrow →', () => text('→'))], { icon: 'symbols' }),
      editItem('Equation', dialog('equation')), sep(),
      editItem('Tab', () => text('    '), { shortcut: 'Shift+F11' }),
      editItem('Horizontal line', () => text('\n────────────────────\n')),
      submenu('Break', [editItem('Line break', () => text('\n')), editItem('Page break', editor.insertPageBreak), editItem('Next-page section break', editor.insertPageBreak, { reason: 'Starts a new page; independent section styles are not yet available.' })]),
      editItem('Bookmark', editor.addBookmark, { icon: 'bookmark' }),
      submenu('Page elements', [item('Page setup', dialog('page')), item('Header and footer…', dialog('headers')), item('Page numbers', () => editor.updatePage({ showPageNumbers: !editor.doc.pageSettings?.showPageNumbers }), { checked: !!editor.doc.pageSettings?.showPageNumbers })]),
      sep(), editItem('Comment', () => { editor.addComment(); view.setShowComments(true); }, { icon: 'comment', shortcut: 'Ctrl+Alt+M' }),
    ] },
    { label: 'Format', items: [
      submenu('Text', [actionFormat('Bold', () => editor.toggleFormat('bold')), actionFormat('Italic', () => editor.toggleFormat('italic')),
        actionFormat('Underline', () => editor.toggleFormat('underline')), actionFormat('Strikethrough', () => editor.toggleFormat('strike')),
        submenu('Font size', [10,11,12,14,16,18,24,32,48].map(n => editItem(`${n} pt`, () => editor.setTextAttribute('size', n)))),
        submenu('Text color', [['Default',null],['Black','#202a33'],['Nexa teal','#167f98'],['Blue','#2465c1'],['Red','#c44050'],['Green','#257b55']].map(([name,color]) => editItem(name, () => editor.setTextAttribute('color', color)))),
        submenu('Highlight', [['None',null],['Yellow','#fff2a3'],['Cyan','#baf1ff'],['Mint','#c8f4da'],['Pink','#ffd4e8']].map(([name,color]) => editItem(name, () => editor.setTextAttribute('highlight', color)))),
        actionFormat('Superscript', () => editor.setTextAttribute('script', 'super')),
        actionFormat('Subscript', () => editor.setTextAttribute('script', 'sub')),
        actionFormat('Normal baseline', () => editor.setTextAttribute('script', null)),
        sep(), actionFormat('Clear formatting', editor.clearFormatting)]),
      submenu('Paragraph styles', ['normal', 'title', 'subtitle', 'h1', 'h2', 'h3'].map((v, i) => editItem(['Normal text', 'Title', 'Subtitle', 'Heading 1', 'Heading 2', 'Heading 3'][i], () => editor.changeParagraph('style', v), { checked: editor.activeParagraph.style === v }))),
      submenu('Align & indent', [
        ...['left', 'center', 'right', 'justify'].map(v => editItem(`Align ${v}`, () => editor.changeParagraph('align', v), { checked: editor.activeParagraph.align === v })),
        sep(), editItem('Increase indent', () => editor.changeIndent(1)), editItem('Decrease indent', () => editor.changeIndent(-1)),
      ]),
      submenu('Line & paragraph spacing', [
        ...[1, 1.15, 1.5, 2].map(v => editItem(`${v} lines`, () => editor.changeParagraph('spacing', v), { checked: editor.activeParagraph.spacing === v })),
        sep(), editItem('Add space before paragraph', () => editor.changeParagraph('spaceBefore', 12)),
        editItem('Remove space before paragraph', () => editor.changeParagraph('spaceBefore', 0)),
        editItem('Add space after paragraph', () => editor.changeParagraph('spaceAfter', 12)),
        editItem('Remove space after paragraph', () => editor.changeParagraph('spaceAfter', 0)),
      ]),
      submenu('Columns', [1,2,3].map(n => item(`${n} column${n === 1 ? '' : 's'}`, () => { editor.updatePage({ columns: n }); view.setPrintLayout(true); }, { checked: (editor.doc.pageSettings?.columns || 1) === n }))),
      submenu('Bullets & numbering', [editItem('Bulleted list', setList('bullet')), editItem('Numbered list', setList('number')),
        editItem('Checklist', setList('checklist')), editItem('No list', setList('none'))]), sep(),
      item('Headers & footers…', dialog('headers')),
      item('Page numbers', () => editor.updatePage({ showPageNumbers: !editor.doc.pageSettings?.showPageNumbers }), { checked: !!editor.doc.pageSettings?.showPageNumbers }),
      submenu('Page orientation', [item('Portrait', () => editor.updatePage({ width: 816, height: 1056 })), item('Landscape', () => editor.updatePage({ width: 1056, height: 816 }))]),
      item(view.printLayout ? 'Switch to pageless format' : 'Switch to pages format', toggle(view.printLayout, view.setPrintLayout)), sep(),
      item('Table formatting…', dialog('tableStyle')),
      item('Image formatting…', dialog('imageStyle')),
      submenu('Borders & lines', [editItem('Bottom paragraph border', () => editor.changeParagraph('borderBottom', true)), editItem('Remove bottom border', () => editor.changeParagraph('borderBottom', false)), editItem('Horizontal rule', () => text('\n────────────────────\n'))]), sep(),
      editItem('Clear formatting', editor.clearFormatting, { icon: 'clear', shortcut: 'Ctrl+\\' }),
    ] },
    { label: 'Tools', items: [
      submenu('Spelling and grammar', [item('Spellcheck (browser)', () => editor.setSpellcheck(!editor.spellcheck), { checked: editor.spellcheck }),
        item('Local writing checks…', dialog('grammar'))], { icon: 'spelling' }),
      item('Word count', dialog('wordcount'), { icon: 'file', shortcut: 'Ctrl+Shift+C' }),
      item('Review suggested edits…', dialog('suggestions')),
      item('Compare a local text file…', dialog('compare')),
      item('Citations and bibliography…', dialog('citations')),
      editItem('Visual signature (not verified)…', dialog('signature')),
      item('Line numbers', toggle(view.showLineNumbers, view.setShowLineNumbers), { checked: view.showLineNumbers, icon: 'number' }),
      item('Document bookmarks and links…', dialog('links')),
      item('Dictionary (selected text)', () => {
        const value = selected.trim().split(/\s+/)[0];
        if (!value) { window.alert('Select a word first.'); return; }
        window.open(`https://en.wiktionary.org/wiki/${encodeURIComponent(value)}`, '_blank', 'noopener,noreferrer');
      }), sep(),
      item('Translate selected text…', () => {
        if (!selected) { window.alert('Select text first.'); return; }
        if (!window.confirm('Open the selected text in Google Translate? The selected content will be shared with that external provider.')) return;
        window.open(`https://translate.google.com/?sl=auto&tl=en&text=${encodeURIComponent(selected.slice(0, 4000))}&op=translate`, '_blank', 'noopener,noreferrer');
      }),
      item('Voice typing…', dialog('voice')), sep(),
      item('Local save notifications…', dialog('notifications')),
      item('Preferences', dialog('preferences'), { icon: 'settings' }),
      item('Accessibility', dialog('accessibility')),
    ] },
    { label: 'Extensions', items: [
      submenu('Add-ons', [item('Open Nexa tools…', dialog('addons'))]),
      item('Build an extension', dialog('addonsInfo')),
    ] },
    { label: 'Help', items: [
      item('Search the menus', () => document.querySelector('.toolbar-search-trigger')?.click(), { icon: 'search', shortcut: 'Alt+/' }), sep(),
      item('Nexa Docs Help', dialog('help')),
      item('Quick start guide', dialog('training')),
      item('What’s new', dialog('updates')), sep(),
      item('Report a problem', dialog('feedback')),
      item('Privacy Policy (preview)', dialog('privacy')),
      item('Terms of Service (preview)', dialog('terms')), sep(),
      item('Keyboard shortcuts', dialog('shortcuts'), { icon: 'keyboard', shortcut: 'Ctrl+/' }),
    ] },
  ];
}
