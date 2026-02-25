audience: worker-deployers
level: patch
reference: issue 8314
---

Azure double-checks if vm is gone by calling virtualMachines.get after instanceView returns 404.
This is to prevent situations when worker is being removed based on one failed instanceView call.
