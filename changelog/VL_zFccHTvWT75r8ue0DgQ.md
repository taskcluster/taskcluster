audience: users
level: patch
---
The dependency resolver no longer stalls for 5 seconds between every batch of
32 resolved tasks. It now only backs off when the queue is drained, which
dramatically improves scheduling latency when many tasks are resolved at once.
