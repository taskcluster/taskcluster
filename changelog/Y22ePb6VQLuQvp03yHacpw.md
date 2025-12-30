audience: users
level: patch
---

Switch back web-server queues to classic, as those are only used for short-lived task group updates in the UI
and don't require same durability and Raft consensus algorithm.
