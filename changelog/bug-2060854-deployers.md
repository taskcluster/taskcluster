audience: deployers
level: major
reference: bug 2060854
---

The web-server now validates `REGISTERED_CLIENTS` at startup. Client registrations with unknown properties, invalid property types, or `requirePkce: true` when `responseType` is not `code` must be corrected before upgrading.

Startup validation also rejects a `maxExpires` that `fromNow` cannot parse or that does not resolve to a future date (such as `''`, `0 seconds` or `-1 year`, which would have issued already-expired credentials), and non-unique `clientId`.
