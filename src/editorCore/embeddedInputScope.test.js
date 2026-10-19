import { isEmbeddedObjectEvent, isEmbeddedObjectFocused } from './embeddedInputScope';

describe('nested rich-media editor event isolation', () => {
  let root;
  let floatingLayer;
  let field;

  beforeEach(() => {
    root = document.createElement('div');
    root.className = 'nexa-edit-surface';
    root.contentEditable = 'true';
    floatingLayer = document.createElement('div');
    floatingLayer.className = 'nexa-floating-layer';
    floatingLayer.contentEditable = 'false';
    field = document.createElement('input');
    field.className = 'nexa-inline-object-field';
    floatingLayer.appendChild(field);
    root.appendChild(floatingLayer);
    document.body.appendChild(root);
  });

  afterEach(() => { root.remove(); });

  test('native beforeinput bubbling from table/chart input is scoped away from document', () => {
    let editedDocument = 0;
    root.addEventListener('beforeinput', event => {
      if (isEmbeddedObjectEvent(event.target)) return;
      editedDocument++;
    });
    field.dispatchEvent(new Event('beforeinput', { bubbles: true }));
    expect(editedDocument).toBe(0);

    const normalText = document.createElement('span');
    root.appendChild(normalText);
    normalText.dispatchEvent(new Event('beforeinput', { bubbles: true }));
    expect(editedDocument).toBe(1);
  });

  test('the document should not restore focus while a chart or table input is active', () => {
    field.focus();
    expect(isEmbeddedObjectFocused()).toBe(true);
    expect(isEmbeddedObjectEvent(field)).toBe(true);
    expect(isEmbeddedObjectEvent(root)).toBe(false);
    field.blur();
    expect(isEmbeddedObjectFocused()).toBe(false);
  });
});
