/** Shared CSS-pixel ruler geometry (96 CSS px = one inch at 100% zoom).
 * Remain independent of the document store, browser DOM and React. */
export const INCH = 96;
export const MIN_MARGIN = 24;
export const INDENT_STEP = 27; // One toolbar indent unit, NOT one ruler drag tick.
export const RULER_SNAP_PX = 3; // 1/32 inch: shared by every draggable marker.
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const roundRuler = value => Math.round(value / RULER_SNAP_PX) * RULER_SNAP_PX;
// Indents are stored in existing toolbar units (27px) for backward compatibility.
// Unlike the old Math.round(... / 27), mouse and keyboard interactions both
// have 3px resolution; do not throw away precision when persisting a value.
export const pxToIndentUnits = pixels => Number((roundRuler(pixels) / INDENT_STEP).toFixed(6));
export const indentUnitsToPx = units => Number(units) * INDENT_STEP;
export function rulerGeometry(page, paragraph = {}) {
  const width = Number(page.width) || 816;
  const height = Number(page.height) || 1056;
  const leftMargin = clamp(Number(page.leftMargin ?? page.margin ?? 100), MIN_MARGIN, width / 2 - 96);
  const rightMargin = clamp(Number(page.rightMargin ?? page.margin ?? 100), MIN_MARGIN, width / 2 - 96);
  const top = clamp(Number(page.topMargin ?? page.margin ?? 100), MIN_MARGIN, height / 2 - 24);
  const bottom = clamp(Number(page.bottomMargin ?? page.margin ?? 100), MIN_MARGIN, height / 2 - 24);
  const indent = clamp(Number(paragraph.indent || 0), 0, 8);
  const left = leftMargin + indentUnitsToPx(indent);
  const rightIndent = clamp(Number(paragraph.rightIndent || 0), 0, Math.max(0, width - rightMargin - left - 44));
  const firstLineIndent = clamp(Number(paragraph.firstLineIndent || 0), -Math.min(96, indentUnitsToPx(indent)), Math.max(0, width - rightMargin - rightIndent - left - 44));
  return { width, height, side: leftMargin, leftMargin, rightMargin, top, bottom, left,
    right: width - rightMargin - rightIndent, indent, rightIndent, firstLineIndent, first: left + firstLineIndent };
}
