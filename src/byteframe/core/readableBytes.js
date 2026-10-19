/** Human-readable byte counts shared by ByteFrame views. */
export function readableBytes(n) {
  if (!Number.isFinite(n) || n < 0) return '0 B';
  if (n < 1024) return `${Math.round(n).toLocaleString()} B`;
  const scale = Math.min(4, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / (1024 ** scale)).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${['B', 'KiB', 'MiB', 'GiB', 'TiB'][scale]}`;
}
