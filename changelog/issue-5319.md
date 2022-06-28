audience: general
level: patch
reference: issue 5319
---
This patch migrates the legacy, `process.hrtime([time])` to the new, `process.hrtime.bigint()`.
See [Node Docs](https://nodejs.org/docs/latest-v16.x/api/process.html#processhrtimetime) for more information.
