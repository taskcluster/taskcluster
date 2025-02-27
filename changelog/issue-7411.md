audience: users
level: patch
reference: issue 7411
---
Generic Worker: no longer `chown` on loopback video/audio devices to the task user so that users in the `video` group may still access them.
