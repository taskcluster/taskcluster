audience: general
level: patch
---
Go code now maps the jsonschema boolean type to `*bool` rather than `bool` in order to differentiate between an unspecified value and `false`.
