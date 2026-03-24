audience: general
level: major
---
BREAKING: Docker-worker cache names are now restricted to alphanumeric
characters, hyphens, underscores, and dots (matching `^[a-zA-Z0-9][a-zA-Z0-9_.-]*$`).
Cache names containing other characters (including slashes and spaces) will
now be rejected at schema validation. Tasks using non-conforming cache names
will need to be updated.
