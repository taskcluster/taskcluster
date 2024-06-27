audience: developers
level: minor
reference: issue 7089
---

Fixes an issue when cancelling a task didn't remove it from the pending queue.
This made worker-manager think there are more pending tasks than there actually were, and create more workers.
