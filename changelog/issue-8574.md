audience: deployers
level: minor
reference: issue 8574
---
The Azure provider in worker-manager now submits VM `beginDelete` inline from `removeWorker`, removing one scanner cycle of latency before cloud-side deletion. Brings Azure to parity with GCP and AWS; the worker-scanner remains the fallback and verifier.
