audience: worker-deployers
level: minor
reference: issue 7443
---

Worker-pool's lifecycle `queueInactivityTimeout` minimum allowed value is increased
to `1200` (20min) to avoid having workers being incorrectly considered idling
while they were working on a task.
