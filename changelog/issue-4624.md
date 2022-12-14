audience: developers
level: minor
reference: issue 4624
---

All language clients now use the getUrl download method to download objects,
including verifying hashes provided when the objects were uploaded.  However,
note that 's3' artifacts are still not verified -- the deployment must use
'object' artifacts to benefit from hash verification.
