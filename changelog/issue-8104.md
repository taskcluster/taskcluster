audience: general
level: patch
reference: issue 8104
---
Fixed task duration not updating in real-time when filtering by status. When using react-window for virtualized task lists, filtering caused different tasks to appear at the same index without triggering a re-render due to React.memo. This is fixed by using react-window's itemKey prop to ensure proper component lifecycle when the task at a given index changes.
