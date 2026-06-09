const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

export default function formatBytes(bytes) {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) {
    return '';
  }

  if (bytes < 1) {
    return `${bytes} B`;
  }

  const exponent = Math.min(
    Math.floor(Math.log10(bytes) / 3),
    UNITS.length - 1
  );
  const value = bytes / 1000 ** exponent;
  const formatted =
    exponent === 0 || value >= 100
      ? value.toFixed(0)
      : value.toFixed(1).replace(/\.0$/, '');

  return `${formatted} ${UNITS[exponent]}`;
}
