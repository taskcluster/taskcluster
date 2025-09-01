audience: worker-deployers
level: minor
reference: issue 7918
---
Worker-manager updates launch config when only "workerManager" part is updated,
to make sure dynamic properties like `publicIp`, `capacityPerInstance` or `maxCapacity` are being updated
