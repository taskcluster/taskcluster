audience: users
level: patch
reference: issue 6124
---

Fix a bug in UI where TaskGroup page would show "Malformed query" warning.
This was due to the `sift` library getting upgraded which changed the behaviour of filters.
