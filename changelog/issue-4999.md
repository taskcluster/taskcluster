audience: worker-deployers
level: minor
reference: issue 4999
---

Trigger immediate resource provisioning for Azure.

Since operations are already async, this shouldn't slow down provisioning loop.
It is done in attempt to prevent azure workers stay in 'Requested' state until the next `workerScannerAzure` loop picks it up.
