/** ByteFrame browser-local fixed-length replacements.
 * Edits never mutate the source File. Constructing the download preserves all
 * unchanged bytes as File slices and groups adjacent edited bytes into runs.
 */
export function putByteEdit(existing, offset, replacement, original) {
  if (!Number.isSafeInteger(offset) || offset < 0) throw new RangeError('Invalid byte offset');
  if (!Number.isInteger(replacement) || replacement < 0 || replacement > 255 ||
      !Number.isInteger(original) || original < 0 || original > 255) {
    throw new RangeError('Bytes must be integers from 0 through 255');
  }
  const next = new Map(existing);
  if (replacement === original) next.delete(offset);
  else next.set(offset, replacement);
  return next;
}

export function overlayByteEdits(bytes, start, patches) {
  if (!bytes) return null;
  const result = bytes.slice();
  // Iterate only the bytes currently displayed, not every edit in the file.
  for (let i = 0; i < result.length; i++) {
    const offset = start + i;
    if (patches.has(offset)) result[i] = patches.get(offset);
  }
  return result;
}

export function buildPatchedBinaryBlob(file, patches) {
  if (!file || typeof file.slice !== 'function' || !Number.isSafeInteger(file.size)) {
    throw new TypeError('A readable File or Blob is required');
  }
  if (!patches?.size) return file;
  const edits = [...patches.entries()].sort((a, b) => a[0] - b[0]);
  const parts = [];
  let cursor = 0;
  for (let i = 0; i < edits.length;) {
    const [first] = edits[i];
    if (!Number.isSafeInteger(first) || first < cursor || first >= file.size) {
      throw new RangeError('Patch lies outside the source file');
    }
    if (first > cursor) parts.push(file.slice(cursor, first));
    const values = [];
    while (i < edits.length && edits[i][0] === first + values.length) {
      const byte = edits[i][1];
      if (!Number.isInteger(byte) || byte < 0 || byte > 255) throw new RangeError('Invalid patched byte');
      values.push(byte);
      i++;
    }
    parts.push(Uint8Array.from(values));
    cursor = first + values.length;
  }
  if (cursor < file.size) parts.push(file.slice(cursor));
  const result = new Blob(parts, { type: file.type || 'application/octet-stream' });
  if (result.size !== file.size) throw new Error('Patched file length changed unexpectedly');
  return result;
}

export function downloadBlobWithName(blob, filename) {
  const name = String(filename || 'untitled.bin').replace(/[\\/:*?"<>|]/g, '-');
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Large files may need time for browser download bookkeeping to complete.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
