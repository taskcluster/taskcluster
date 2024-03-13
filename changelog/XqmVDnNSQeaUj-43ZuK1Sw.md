audience: general
level: patch
---
Generic Worker now utilizes `filepath.WalkDir` instead of `filepath.Walk`.

`filepath.WalkDir` was introduced in go1.16 and is more performant and efficient over `filepath.Walk`.

This _may_ help with race conditions during artifact uploads, where a file was initially seen, but then became unavailable at upload time.
