audience: admins
level: patch
---
Upgrade to Sentry v6, but disable the new
[session tracking feature](https://docs.sentry.io/product/releases/health/)
with ``autoSessionTracking: false``, to avoid collecting more data than is
needed.
