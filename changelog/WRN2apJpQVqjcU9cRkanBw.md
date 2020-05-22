audience: users
level: patch
---
Fix docker worker not working in the latest release of Taskcluster. It was
previously throwing `taskVolumeBindings is not iterable`.
