audience: users
level: patch
reference: issue 9284
---
The `taskcluster` Homebrew cask no longer triggers deprecation warnings for the `verified` URL parameter and the `postflight` stanza. It is now built with goreleaser v2.19.0, which removes `verified` and writes the macOS quarantine-removal hook as `postflight_steps`.
