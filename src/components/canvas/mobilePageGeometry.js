/** Temporary viewport-dependent page geometry; never mutates saved paper settings.
 * Uses ordinary CSS pixels so mobile text reflows at a readable size. */
export function mobilePageGeometry(sourcePage, viewportWidth, zoom = 100) {
  const originalWidth = Math.max(300, Number(sourcePage.width) || 816);
  const originalHeight = Math.max(400, Number(sourcePage.height) || 1056);
  const scale = Math.max(.5, Math.min(3, Number(zoom) / 100 || 1));
  // The underlying ruler engine needs at least ~250px to retain valid margins.
  const width = Math.min(originalWidth, Math.max(256, Math.floor((viewportWidth - 22) / scale)));
  const ratio = width / originalWidth;
  const side = name => Math.max(24, Math.min(width * .19,
    Math.round((Number(sourcePage[name] ?? sourcePage.margin) || 100) * ratio)));
  const vertical = name => Math.max(35,
    Math.round((Number(sourcePage[name] ?? sourcePage.margin) || 100) * ratio));
  return { ...sourcePage,
    width, height: Math.max(490, Math.round(originalHeight * ratio)),
    margin: side('margin'), leftMargin: side('leftMargin'), rightMargin: side('rightMargin'),
    topMargin: vertical('topMargin'), bottomMargin: vertical('bottomMargin'),
  };
}
