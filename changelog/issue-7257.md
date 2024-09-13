audience: worker-deployers
level: minor
reference: issue 7257
---

Worker-manager provides an option to request public IP for generic-worker in Azure that is skipped by default.
Passing `publicIp = true` in the launch configuration will enable the public IP request.

```json
{
  "workerManager": {
    "publicIp": true
  }
}
```
