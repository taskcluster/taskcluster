audience: users
level: patch
reference: issue 7411
---
Generic Worker: no longer `chown` on loopback video/audio devices to the task user. Explicitly change group of the devices to `video`/`audio`, respectively, so that users in those group may still access them.
