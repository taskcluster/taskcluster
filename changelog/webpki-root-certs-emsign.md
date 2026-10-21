audience: users
level: patch
---
The Rust client's lockfile now uses `webpki-root-certs` 1.0.10, which removes the compromised emSign ECC Root CA - G3 root [SECURITY]. Applications that depend on the `taskcluster` crate should also run `cargo update -p webpki-root-certs` to pick up the fix in their own lockfiles.
