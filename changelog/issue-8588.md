audience: deployers
level: minor
reference: issue 8588
---
Fixes a bug in the auth service where the in-memory client cache reload could silently skip or duplicate clients when concurrent client inserts/expirations happened during the reload. Caused by offset-based pagination over the `clients` table — the same root cause as #8586 / #8587 in worker-manager. The cache reload now uses keyset pagination via a new function `get_clients_after` in DB version 0126; the auth API `listClients` endpoint and the static-clients sync are migrated to the same function. The most visible symptom was transient authentication failures for newly-created clients until the next reload.
