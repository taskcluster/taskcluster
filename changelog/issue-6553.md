audience: users
level: minor
reference: issue 6553
---
Generic Worker File Mounts now include an optional `format` field to specify the compression format for the content. Generic Worker will decompress the retrieved content using the format specified before writing to disk. To avoid decompression, do not include the format field.

Allowed compression formats are: `bz2`, `gz`, `lz4`, `xz`, and `zst`.

This change additionally adds support for the `tar.lz4` format for Writable Directory Caches and Read Only Directories.
