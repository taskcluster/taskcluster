audience: worker-deployers
level: patch
---
On Windows, the worker now replaces the whole security descriptor of the files it secures instead of just dropping ACL inheritance on it. The ownership is now also changed to `BUILTIN\Administrators`
