level: patch
audience: users
---
The generic-worker now notifies task status listeners outside of the internal status lock, reducing the risk of lock contention or deadlock when listeners query task status during callbacks.

Internal artifact upload error handling was also refactored into a dedicated classifier helper without changing runtime behavior.
