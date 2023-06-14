audience: users
level: minor
reference: issue 5994
---
Generic Worker: Adds `task.payload.feature.loopbackVideo` for loopback video device support on Linux.

The `v4l2loopback` kernel module is required on the host system for this feature to work, as generic worker will load this module and create the video device for the worker to use.

The resulting video device will be located at `/dev/video0` by default (device number can be configured using the `loopbackVideoDeviceNumber` field within the worker config) and an environment variable `TASKCLUSTER_VIDEO_DEVICE` will be created for the task user to use. Ex. `loopbackVideoDeviceNumber: 1` will create `/dev/video1` for the task user.
