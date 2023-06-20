audience: users
level: minor
reference: issue 5994
---
Generic Worker: Adds `task.payload.feature.loopbackVideo` for loopback video device support on Linux.

The `v4l2loopback` kernel module must be installed on the host system for this feature to work, although it does not _need_ to be loaded. Generic Worker loads the module with `modprobe` and generates the virtual video device with a `v4l2loopback` command. Under the multiuser engine, it also manages file ownership of the device with `chown` to ensure that only tasks with suitable scopes have read/write access to the virtual device.

For tasks that enable the feature, the virtual video device location will be provided to the task commands via the environment variable `TASKCLUSTER_VIDEO_DEVICE`. The value of the environment variable depends on deployment configuration, and therefore tasks should not assume a fixed value. Its value will however take the form `/dev/video<DEVICE_NUMBER>` where `<DEVICE_NUMBER>` is an integer between 0 and 255. The Generic Worker config setting `loopbackVideoDeviceNumber` may be used to change the device number. Future releases of Generic Worker may provide the capability of having more than one virtual video device; currently only one virtual video device is supported.
