audience: users
level: minor
reference: issue 4624
---
The object service now supports an additional download method, `getUrl`, which handles gzipped content and requires that hashes be validated.
This method is not yet supported by the client libraries (but such support will be added soon).
