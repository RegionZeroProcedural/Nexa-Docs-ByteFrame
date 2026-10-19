import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';

beforeEach(() => { window.localStorage.clear(); window.sessionStorage.clear(); });

test('renders editable content and the formatting toolbar', () => {
  render(<App />);
  expect(screen.getByRole('textbox', { name: 'Document content' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Bold/ })).toBeInTheDocument();
  expect(screen.getByText(/Ln 1, Col 1/)).toBeInTheDocument();
});

test('includes File, Edit, View, Insert, Format, Tools, Extensions and Help menus', () => {
  render(<App />);
  for (const name of ['File','Edit','View','Insert','Format','Tools','Extensions','Help']) {
    const trigger = screen.getByRole('button', { name });
    fireEvent.click(trigger);
    expect(screen.getByRole('menu', { name: `${name} menu` })).toBeInTheDocument();
    fireEvent.click(trigger);
  }
});

test('header chevron hides only the top header, not the formatting toolbar', () => {
  render(<App />);
  const hide = screen.getByRole('button', { name: 'Hide document header' });
  fireEvent.click(hide);
  expect(screen.getByRole('button', { name: /Bold/ })).toBeInTheDocument();
  expect(document.querySelector('#nexa-document-header')).toHaveAttribute('hidden');
  fireEvent.click(screen.getByRole('button', { name: 'Show document header' }));
  expect(document.querySelector('#nexa-document-header')).not.toHaveAttribute('hidden');
});

test('shows a local find and replace dialog through the Edit menu', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  fireEvent.click(screen.getByRole('menuitem', { name: /Find and replace/ }));
  expect(screen.getByRole('dialog', { name: 'Find and replace' })).toBeInTheDocument();
  expect(screen.getByText('Replace with')).toBeInTheDocument();
});

test('shows supported and unavailable features honestly', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Extensions' }));
  expect(screen.getByRole('menuitem', { name: /Apps Script/ })).toBeDisabled();
});

test('places existing annotations in a comment rail beside the page', () => {
  window.localStorage.setItem('nexa-docs:draft:v1', JSON.stringify({
    text: 'First paragraph\nSecond paragraph', title: 'Notes', formats: [],
    comments: [{ id: 'comment-1', start: 0, end: 5, text: 'Review this section', resolved: false }],
    embeds: [], paragraphs: [],
  }));
  render(<App />);
  expect(screen.getByRole('complementary', { name: 'Document comments' })).toBeInTheDocument();
  expect(screen.getByText('Review this section')).toBeInTheDocument();
});

test('hover opens submenu and hovering a sibling closes the previous branch', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'File' }));
  fireEvent.mouseEnter(screen.getByRole('menuitem', { name: /Download/ }));
  expect(screen.getByRole('menu', { name: 'Download submenu' })).toBeInTheDocument();
  fireEvent.mouseEnter(screen.getByRole('menuitem', { name: /^New/ }));
  expect(screen.getByRole('menu', { name: 'New submenu' })).toBeInTheDocument();
  expect(screen.queryByRole('menu', { name: 'Download submenu' })).not.toBeInTheDocument();
});

test('renders graduated vertical page ruler outside editable paper', () => {
  render(<App />);
  const ruler = document.querySelector('.paper-page-frame .ruler-left');
  expect(ruler).toBeInTheDocument();
  expect(ruler.querySelectorAll('.ruler-left-tick-major').length).toBeGreaterThan(6);
  expect(ruler.querySelectorAll('.ruler-left-margin-boundary')).toHaveLength(2);
});

test('inserting an equation symbol does not call a missing editor method', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Insert' }));
  fireEvent.click(screen.getByRole('menuitem', { name: /^Equation/ }));
  expect(screen.getByRole('dialog', { name: 'Insert equation symbols' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Insert π' }));
  expect(screen.getByRole('textbox', { name: 'Document content' })).toHaveTextContent('π');
});

test('clicking a portalled submenu command executes instead of closing on pointerdown', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'File' }));
  fireEvent.mouseEnter(screen.getByRole('menuitem', { name: /Download/ }));
  const command = screen.getByRole('menuitem', { name: /Plain text/ });
  const createObjectURL = URL.createObjectURL;
  const revokeObjectURL = URL.revokeObjectURL;
  URL.createObjectURL = jest.fn(() => 'blob:test');
  URL.revokeObjectURL = jest.fn();
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = jest.fn();
  try {
    fireEvent.pointerDown(command);
    fireEvent.click(command);
    expect(URL.createObjectURL).toHaveBeenCalled();
  } finally {
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    HTMLAnchorElement.prototype.click = click;
  }
});

test('menu search closes when clicking outside its popover', () => {
  render(<App />);
  const searchButton = screen.getByRole('button', { name: 'Menus' });
  fireEvent.click(searchButton);
  expect(screen.getByRole('textbox', { name: 'Search menus or document' })).toBeInTheDocument();
  fireEvent.pointerDown(screen.getByRole('textbox', { name: 'Document content' }));
  expect(screen.queryByRole('textbox', { name: 'Search menus or document' })).not.toBeInTheDocument();
});

test('document workspace starts directly with the page rather than a decorative divider', () => {
  render(<App />);
  expect(document.querySelector('.workspace-heading')).not.toBeInTheDocument();
  expect(document.querySelector('.ruler-handle-firstLineIndent')).toBeInTheDocument();
  expect(document.querySelector('.ruler-handle-indent')).toBeInTheDocument();
  expect(document.querySelector('.ruler-handle-rightIndent')).toBeInTheDocument();
});


test('print layout adds physical pages when paragraphs exceed the sheet', () => {
  const text = Array.from({ length: 75 }, (_, i) => `Paragraph ${i}: a test of page layout`).join('\n');
  window.localStorage.setItem('nexa-docs:draft:v1', JSON.stringify({
    title: 'Long document', text, formats: [], paragraphs: [], comments: [], embeds: [],
    pageSettings: { width: 816, height: 1056, leftMargin: 100, rightMargin: 100, topMargin: 100, bottomMargin: 100 },
  }));
  render(<App />);
  expect(document.querySelectorAll('.paper-page').length).toBeGreaterThan(1);
  expect(document.querySelector('[data-line-index="74"]')).toHaveTextContent('Paragraph 74');
});

test('header places favorite and save status immediately after measured title', () => {
  render(<App />);
  const title = screen.getByRole('textbox', { name: 'Document title' });
  const sizing = title.closest('.document-title-sizing');
  expect(sizing.querySelector('.document-title-measure')).toHaveTextContent('Untitled document');
  expect(sizing.nextElementSibling).toHaveClass('document-extension');
  expect(sizing.nextElementSibling.nextElementSibling).toHaveClass('favorite-button');
  expect(sizing.nextElementSibling.nextElementSibling.nextElementSibling).toHaveClass('saved-indicator');
});


test('an emptied title returns to the name from before editing on blur', () => {
  render(<App />);
  const input = screen.getByRole('textbox', { name: 'Document title' });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: 'Working name' } });
  fireEvent.blur(input);
  expect(input).toHaveValue('Working name');
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: '' } });
  fireEvent.blur(input);
  expect(input).toHaveValue('Working name');
});

test('whitespace-only title also reverts, and Escape cancels renaming', () => {
  render(<App />);
  const input = screen.getByRole('textbox', { name: 'Document title' });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: '   ' } });
  fireEvent.blur(input);
  expect(input).toHaveValue('Untitled document');
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: 'Changed title' } });
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(input).toHaveValue('Untitled document');
});

test('long document names keep star and save indicators as separate flex siblings', () => {
  render(<App />);
  const title = screen.getByRole('textbox', { name: 'Document title' });
  fireEvent.focus(title);
  fireEvent.change(title, { target: { value: 'A very long document name '.repeat(5) } });
  const sizing = title.closest('.document-title-sizing');
  expect(sizing.querySelector('.document-title-measure')).toHaveTextContent('A very long document name '.repeat(5).slice(0, 120));
  expect(sizing.nextElementSibling).toHaveClass('document-extension');
  expect(sizing.nextElementSibling.nextElementSibling).toHaveClass('favorite-button');
  expect(sizing.nextElementSibling.nextElementSibling.nextElementSibling).toHaveClass('saved-indicator');
});


test('extension field keeps previous valid value if blank or Escape is pressed', () => {
  render(<App />);
  const field = screen.getByRole('textbox', { name: 'File extension' });
  fireEvent.focus(field);
  fireEvent.change(field, { target: { value: '' } });
  fireEvent.blur(field);
  expect(field).toHaveValue('.txt');
  fireEvent.focus(field);
  fireEvent.change(field, { target: { value: '.nxtf' } });
  fireEvent.keyDown(field, { key: 'Escape' });
  expect(field).toHaveValue('.txt');
});


test('ByteFrame remains independently available in the View menu', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'View' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'ByteFrame analysis panel' }));
  expect(screen.getByRole('complementary', { name: 'Hex and opcode inspector' })).toBeInTheDocument();
});

test('does not show an NXTF-specific menu', () => {
  render(<App />);
  expect(screen.queryByRole('button', { name: '.nxtf' })).not.toBeInTheDocument();
});
