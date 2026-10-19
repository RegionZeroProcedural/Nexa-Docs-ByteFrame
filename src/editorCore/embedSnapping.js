import { clamp } from './embedPosition';

/**
 * Snap a floating document object to meaningful guides in CSS page pixels.
 * These are *visual* anchors; document text and logical insertion offsets never move.
 * Candidates include the writing margins, page center, paper safe edges and
 * alignment with the bounds of other floating objects on the target page.
 * Alt disables snapping temporarily. The returned guides are purely visual.
 */
export function snapEmbedPosition(position, size, page, neighbors = [], options = {}) {
  const width = Math.max(1, Number(size.width) || 1);
  const height = Math.max(1, Number(size.height) || 1);
  const pageWidth = Math.max(1, Number(page.width) || 816);
  const pageHeight = Math.max(1, Number(page.height) || 1056);
  const padding = 8;
  const threshold = Math.max(0, Number(options.threshold ?? 10));
  const bounds = {
    xMax: Math.max(padding, pageWidth - width - padding),
    yMax: Math.max(padding, pageHeight - height - padding),
  };
  const value = {
    x: clamp(Number(position.x) || 0, padding, bounds.xMax),
    y: clamp(Number(position.y) || 0, padding, bounds.yMax),
  };
  if (options.disabled) return { position: value, guides: [] };

  // To align objects, compare each edge/center of the dragged object with
  // each comparable reference, not just its top-left corner.
  const centers = {
    x: [0, width / 2, width],
    y: [0, height / 2, height],
  };
  const xRefs = [
    { at: Number(page.marginLeft) || 96, name: 'Left margin' },
    { at: pageWidth - (Number(page.marginRight) || 96), name: 'Right margin' },
    { at: pageWidth / 2, name: 'Page center' },
    { at: padding, name: 'Paper edge' },
    { at: pageWidth - padding, name: 'Paper edge' },
  ];
  const yRefs = [
    { at: Number(page.marginTop) || 96, name: 'Top margin' },
    { at: pageHeight - (Number(page.marginBottom) || 96), name: 'Bottom margin' },
    { at: pageHeight / 2, name: 'Page center' },
    { at: padding, name: 'Paper edge' },
    { at: pageHeight - padding, name: 'Paper edge' },
  ];
  for (const rect of neighbors) {
    if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) continue;
    for (const at of [rect.x, rect.x + rect.width / 2, rect.x + rect.width]) xRefs.push({ at, name: 'Object alignment' });
    for (const at of [rect.y, rect.y + rect.height / 2, rect.y + rect.height]) yRefs.push({ at, name: 'Object alignment' });
  }
  function align(axis, refs) {
    const length = axis === 'x' ? width : height;
    const max = axis === 'x' ? bounds.xMax : bounds.yMax;
    let best = null;
    for (const ref of refs) {
      for (const anchor of centers[axis]) {
        const candidate = ref.at - anchor;
        if (candidate < padding || candidate > max) continue;
        const distance = Math.abs(candidate - value[axis]);
        if (distance <= threshold && (!best || distance < best.distance)) {
          best = { distance, target: candidate, at: ref.at, label: ref.name };
        }
      }
    }
    if (!best) return null;
    value[axis] = best.target;
    return { axis, at: best.at, label: best.label };
  }
  const guides = [align('x', xRefs), align('y', yRefs)].filter(Boolean);
  return { position: { x: Math.round(value.x), y: Math.round(value.y) }, guides };
}
