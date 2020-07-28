audience: deployers
level: minor
reference: issue 3083
---
The auth service's clients are now stored in the `clients` table and the service accesses that information directly, rather than via taskcluster-lib-entities.  As the number of clients is small, this migration should be very fast.
