audience: worker-deployers
level: patch
reference: issue 7388
---
Generic Worker (FreeBSD): taskcluster-proxy now cross-compiles for freebsd/amd64 and freebsd/arm64 again. The new connection-verification feature (`--allowed-user` / `--allowed-network`) only has darwin, linux, and windows implementations; on FreeBSD the proxy refuses to start if either flag is set. FreeBSD support for taskcluster-proxy is experimental.
