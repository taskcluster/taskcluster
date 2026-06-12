audience: users
level: patch
reference: issue 8711
---
The recently-viewed task and task group lists no longer drop existing entries
after the IndexedDB schema upgrade: records written before the recency-index
change are back-filled so they keep appearing until they age out of view. The
Name cell now shows the task or task group id as a clickable link when no task
name is available, instead of a blank, unclickable cell.
