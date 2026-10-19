/**
 * Native beforeinput listeners are attached to the shared document editing
 * surface. Events from controls embedded in floating tables/charts bubble
 * through that surface even though the objects are contentEditable=false.
 * Keep those controls outside the document text-editing pipeline.
 */
export function isEmbeddedObjectEvent(target) {
  const element = target?.nodeType === 1 ? target : target?.parentElement;
  return Boolean(element?.closest?.('.nexa-floating-layer'));
}

export function isEmbeddedObjectFocused() {
  return typeof document !== 'undefined' && isEmbeddedObjectEvent(document.activeElement);
}
