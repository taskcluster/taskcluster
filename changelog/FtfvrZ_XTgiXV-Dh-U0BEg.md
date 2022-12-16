audience: developers
level: patch
---
This patch makes it so the taskcluster shell client (cli) is built with `goreleaser`.

`goreleaser` also will automatically keep our [homebrew-tap](https://github.com/taskcluster/homebrew-tap/blob/main/Formula/taskcluster.rb) formula up-to-date during the release process.

GitHub releases will now also contain zipped Windows executables of this cli supporting both amd64 and arm64. arm64 binaries for linux have been added as well.

The darwin and linux binaries are now tarballs.
