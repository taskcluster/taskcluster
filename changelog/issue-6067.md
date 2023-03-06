audience: deployers
level: patch
reference: issue 6067
---

Worker-manager now considers `stoppingCapacity` when estimating the required number of workers to start, preventing failed to start workers from growing beyond `maxCapacity` and slowing down the scanner loop.
