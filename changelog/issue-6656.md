audience: general
level: patch
reference: issue 6656
---
D2G now shell escapes environment variable key names in case they contain spaces or special characters that would previously mess up the `podman run...` command.
