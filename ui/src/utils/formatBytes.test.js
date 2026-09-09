import formatBytes from './formatBytes';

describe('formatBytes', () => {
  it('returns empty string for null or undefined', () => {
    expect(formatBytes(null)).toBe('');
    expect(formatBytes(undefined)).toBe('');
  });

  it('returns empty string for NaN', () => {
    expect(formatBytes(NaN)).toBe('');
  });

  it('formats bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(999)).toBe('999 B');
  });

  it('formats kilobytes', () => {
    expect(formatBytes(1000)).toBe('1 KB');
    expect(formatBytes(1500)).toBe('1.5 KB');
  });

  it('formats megabytes', () => {
    expect(formatBytes(1_000_000)).toBe('1 MB');
    expect(formatBytes(2_500_000)).toBe('2.5 MB');
  });

  it('formats gigabytes and larger', () => {
    expect(formatBytes(1e9)).toBe('1 GB');
    expect(formatBytes(1e12)).toBe('1 TB');
    expect(formatBytes(1e15)).toBe('1 PB');
  });

  it('drops fractional digit when value is large', () => {
    expect(formatBytes(150_543)).toBe('151 KB');
  });
});
