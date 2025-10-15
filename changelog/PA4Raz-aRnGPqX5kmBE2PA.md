audience: worker-deployers
level: patch
---

Improves Azure resource deprovisioning by skipping checks on already deleted resources.
Previously implemented logic was flawed in a way that same resources would be queried over and over.
Which led to an increased number of cloud api calls and was likely causing some minor delays per each worker being deprovisioned
