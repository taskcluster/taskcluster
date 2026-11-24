import ArchiveIcon from 'mdi-react/ArchiveIcon';
import FileCodeIcon from 'mdi-react/FileCodeIcon';
import FileDocumentIcon from 'mdi-react/FileDocumentIcon';
import FileIcon from 'mdi-react/FileIcon';
import FileImageIcon from 'mdi-react/FileImageIcon';
import FileMusicIcon from 'mdi-react/FileMusicIcon';
import FilePdfIcon from 'mdi-react/FilePdfIcon';
import FileVideoIcon from 'mdi-react/FileVideoIcon';
import { describe, expect, it } from 'vitest';
import getIconFromMime from './getIconFromMime';

describe('getIconFromMime', () => {
  it.each([
    ['text/xml; charset=utf-8', FileCodeIcon],
    ['text/html; charset=utf-8', FileCodeIcon],
    ['text/css; charset=utf-8', FileCodeIcon],
    ['text/javascript; charset=utf-8', FileCodeIcon],
    ['text/x-python; charset=utf-8', FileCodeIcon],
    ['application/json; charset=utf-8', FileCodeIcon],
    ['TEXT/XML', FileCodeIcon],
    [' application/json ', FileCodeIcon],
  ])('ignores parameters, case and whitespace: %s', (contentType, icon) => {
    expect(getIconFromMime(contentType)).toBe(icon);
  });

  it.each([
    ['application/json', FileCodeIcon],
    ['application/yaml', FileCodeIcon],
    ['application/x-shellscript', FileCodeIcon],
    ['application/vnd.api+json', FileCodeIcon],
    ['application/atom+xml', FileCodeIcon],
    ['application/pdf', FilePdfIcon],
    ['application/zip', ArchiveIcon],
    ['application/gzip', ArchiveIcon],
    ['application/x-xz', ArchiveIcon],
    ['application/zstd', ArchiveIcon],
    ['application/x-apple-diskimage', ArchiveIcon],
    ['application/x-xpinstall', ArchiveIcon],
    ['application/x-compressed', ArchiveIcon],
    ['image/png', FileImageIcon],
    ['image/svg+xml', FileImageIcon],
    ['video/mp4', FileVideoIcon],
    ['audio/mpeg', FileMusicIcon],
    ['text/plain; charset=utf-8', FileDocumentIcon],
    ['text/csv; charset=utf-8', FileDocumentIcon],
    ['text/x-log', FileDocumentIcon],
  ])('maps %s', (contentType, icon) => {
    expect(getIconFromMime(contentType)).toBe(icon);
  });

  it.each([
    'application/binary',
    'application/octet-stream',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/x-startup',
    '',
  ])('falls back to the generic file icon for %s', contentType => {
    expect(getIconFromMime(contentType)).toBe(FileIcon);
  });
});
