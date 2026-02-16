audience: worker-deployers
level: minor
reference: issue 7147
---

Worker-manager decides which workers should be kept during worker-scanner loop.
Decision is being made based on several policies:
- if launch config is archived - worker would be marked as "shouldTerminate=true"
- if workers exceed the desired capacity (more workers than pending tasks) - workers would be marked as "shouldTerminate=true"
