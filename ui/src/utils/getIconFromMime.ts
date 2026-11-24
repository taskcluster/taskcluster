import ArchiveIcon from 'mdi-react/ArchiveIcon';
import FileCodeIcon from 'mdi-react/FileCodeIcon';
import FileDocumentIcon from 'mdi-react/FileDocumentIcon';
import FileIcon from 'mdi-react/FileIcon';
import FileImageIcon from 'mdi-react/FileImageIcon';
import FileMusicIcon from 'mdi-react/FileMusicIcon';
import FilePdfIcon from 'mdi-react/FilePdfIcon';
import FileVideoIcon from 'mdi-react/FileVideoIcon';
import type { MdiReactIconComponentType } from 'mdi-react';

const MIMETYPE_ICONS: ReadonlyArray<
  readonly [MdiReactIconComponentType, ReadonlyArray<string | RegExp>]
> = [
  [FileVideoIcon, [/^video\//]],
  [FileImageIcon, [/^image\//]],
  [FileMusicIcon, [/^audio\//]],
  [FilePdfIcon, ['application/pdf', 'application/postscript']],
  [
    ArchiveIcon,
    [
      'application/zip',
      'application/x-zip-compressed',
      'application/gzip',
      'application/x-gzip',
      'application/x-tar',
      'application/x-gtar',
      'application/x-compressed',
      'application/x-bzip2',
      'application/x-lzip',
      'application/x-lzma',
      'application/x-lzop',
      'application/x-xz',
      'application/zstd',
      'application/x-compress',
      'application/java-archive',
      'application/x-apple-diskimage',
      'application/vnd.ms-cab-compressed',
      'application/vnd.android.package-archive',
      'application/x-xpinstall',
    ],
  ],
  [
    FileCodeIcon,
    [
      'application/json',
      'application/jsonl',
      'application/xml',
      'application/javascript',
      'application/ecmascript',
      'application/yaml',
      'application/x-shellscript',
      'text/html',
      'text/css',
      'text/javascript',
      'text/xml',
      'text/x-python',
      /\+(json|xml)$/,
    ],
  ],
  [FileDocumentIcon, [/^text\//]],
];

/**
 * Matching patterns for finding an icon from a mimetype, most specific
 * mimetype are listed first as they are matched top down.
 */
export default (contentType: string): MdiReactIconComponentType => {
  const mimeType = contentType.split(';')[0].trim().toLowerCase();
  const entry = MIMETYPE_ICONS.find(([, patterns]) =>
    patterns.some(pattern =>
      pattern instanceof RegExp ? pattern.test(mimeType) : pattern === mimeType
    )
  );

  return entry ? entry[0] : FileIcon;
};
