audience: users
level: minor
reference: issue 6553
---
Generic Worker File Mounts now allow for an optional `format` field to be set, to indicate the compression of the file to the worker so it can properly decompress for you. If you don't want your compressed file to be automatically decompressed, please refrain from setting the `format` field.

Allowed compression formats are: `bz2`, `gz`, `lz4`, `xz`, and `zst`.

This change additionally adds support for the `tar.lz4` format for Writable Directory Caches and Read Only Directories.
