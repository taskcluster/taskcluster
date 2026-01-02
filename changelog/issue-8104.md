audience: general
level: patch
reference: issue 8104
---
Fixed task duration not updating in real-time when filtering by status. When using react-window for virtualized task lists, the Duration component's interval was not properly reset when filtering caused different tasks to appear at the same index. This is fixed by adding a key prop based on taskId and start time.
