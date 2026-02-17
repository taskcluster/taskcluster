audience: worker-deployers
level: minor
reference: issue 7147
---

Worker-manager now decides which workers should be kept during the worker-scanner loop, surfaced via the `shouldWorkerTerminate` API.
Decision is being made based on several policies:
- if launch config is archived - worker would be marked as "shouldTerminate=true"
- if workers exceed the desired capacity (more workers than pending tasks) - the oldest workers would be marked as "shouldTerminate=true" (newest workers are kept)
