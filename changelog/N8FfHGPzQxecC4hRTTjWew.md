audience: developers
level: patch
---
The Rust client now correctly base64-encodes `ext` hawk values with the STANDARD alphabet instead of URL_SAFE. This may fix intermittent generation of invalid temporary credentials.
