audience: deployers
level: patch
reference: issue 6641
---
Worker-manager no longer counts "stopping" instances as part of the existing capacity when estimating the number of workers to start (although they are still counted towards maxCapacity).
