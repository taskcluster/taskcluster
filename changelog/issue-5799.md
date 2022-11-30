audience: users
level: major
reference: issue 5799
---
Docker Worker no longer supports the `disableSeccomp` capability (added in Docker Worker 44.22.0, but turned out to be unneeded).

Since this is technically a breaking change, a major version bump is necessary. However, as far as we know, nothing needed this feature.
