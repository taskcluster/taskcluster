audience: deployers
level: major
reference: bug 2060854
---

The web-server now validates `REGISTERED_CLIENTS` at startup. Client registrations with unknown properties, invalid property types, or `requirePkce: true` when `responseType` is not `code` must be corrected before upgrading.
