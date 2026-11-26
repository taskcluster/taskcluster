level: patch
audience: deployers
reference: issue 9482
---
Requests that carry a malformed `X-Forwarded-Port` header (for example a non-numeric value) or an `X-Forwarded-For` that does not hold an IP address (for example `unknown`) no longer fail with a 500 `Schema Validation Failed!` error from `authenticateHawk`. The port header is ignored when it is not a valid port, and the source IP, which is only used for audit logging, is left out when it is not an IP address.
