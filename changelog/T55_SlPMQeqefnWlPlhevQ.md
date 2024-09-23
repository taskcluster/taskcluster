audience: worker-deployers
level: minor
---
Generic Worker: Adds `enableD2G` worker config option to internally process Docker Worker payloads using D2G. Defaults to `false` and will return a `malformed-payload` if a Docker Worker payload is detected and this config isn't set to `true`.
