audience: users
level: minor
---
Generic Worker: Replaced the deprecated `github.com/mholt/archiver/v3` library with `github.com/mholt/archives`, and added support for new archive and compression formats in task payload mounts.

New decompression formats for `FileMount`: `br` (Brotli), `lz` (Lzip), `mz` (MinLZ), `sz` (Snappy/S2), `zz` (Zlib).

New archive formats for `ReadOnlyDirectory` and `WritableDirectoryCache`: `7z`, `tar`, `tar.br`, `tar.lz`, `tar.mz`, `tar.sz`, `tar.zz`.

Artifact uploads now skip gzip compression for files with extensions matching the newly supported compressed formats (`.br`, `.lz`, `.lz4`, `.mz`, `.sz`, `.zz`).
