audience: worker-deployers
level: patch
---
Worker Runner/Generic Worker (Azure): polls the metadata service for events the worker should gracefully terminate on every second (down from 15s). This frequency is recommended by Microsoft [here](https://learn.microsoft.com/en-us/azure/virtual-machines/windows/scheduled-events#polling-frequency) and will hopefully reduce tasks resolving as `claim-expired`.
