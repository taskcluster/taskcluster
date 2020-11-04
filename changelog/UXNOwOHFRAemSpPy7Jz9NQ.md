audience: deployers
level: patch
---
Setting a node `DEBUG` env var via the `debug` field of service configs is supported again.
If left unset it will default to `''`. Example:

```yaml
auth:
    debug: '*'
```