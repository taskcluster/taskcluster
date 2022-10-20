audience: deployers
level: patch
reference: issue 5726
---
The github service no longer fetches live logs from workers, but instead fetches backing logs from artifact storage. This reduces exceptions due to certificate expiries of live logs from stateless dns server.
