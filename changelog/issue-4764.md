audience: users
level: patch
reference: issue 4764
---
The JS, Rust, Go (in a previous release) and Python clients now have artifact download functions which will download an artifact regardless of its storage type, applying retries and other best practices.
