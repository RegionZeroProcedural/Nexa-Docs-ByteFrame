/** Simple filename extension normalization; separate from any specialized file format. */
export function normalizeExtension(raw) {
  const trimmed = String(raw || '').trim().replace(/^\.+/, '').toLowerCase();
  return /^[a-z0-9_-]{1,12}$/.test(trimmed) && trimmed !== 'nxtf' ? `.${trimmed}` : null;
}
