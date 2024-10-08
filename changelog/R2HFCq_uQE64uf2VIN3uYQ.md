audience: users
level: patch
---
D2G: No longer specify file mount format on image if compressed with gzip, bzip2, xz, or zstd when using docker. Generic Worker will now no longer decompress these files before running `docker load`. Docs [here](https://docs.docker.com/reference/cli/docker/image/load/).
