audience: users
level: patch
reference: issue 2721
---
Taskcluster-proxy now correctly proxies "non-canonical" URLs, such as those containing `//` or urlencoded values.
