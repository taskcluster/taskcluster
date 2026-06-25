level: patch
audience: users
reference: issue 4585
---
Generic worker interactive shells now set `TERM` to `xterm-256color` instead of
`hterm-256color` which fixes some whitespace quirks on copy
