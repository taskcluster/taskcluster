audience: worker-deployers
level: patch
reference: issue 8176
---

Worker-manager ensures workers are spawned for single launch config worker pools when adjusted weight might drop below zero with remaining capacity.
