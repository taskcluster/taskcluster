audience: developers
level: patch
---
Fixed the rust library for uploading artifact when the object service returned
a `content-length` header. It will now avoid duping the header which was
resulting in 400s from upstream object storages.
