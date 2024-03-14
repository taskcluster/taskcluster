audience: worker-deployers
level: major
reference: issue 6832
---
The Generic Worker `simple` engine has been renamed to the `insecure` engine.

All future release binaries for this engine will also be renamed (e.g. `generic-worker-simple-darwin-arm64` --> `generic-worker-insecure-darwin-arm64`), so please update any scripts that reference the `simple` engine binary.

This change was made to help make it extremely apparent that it should not be used in production environments and is only recommened for testing and development.
