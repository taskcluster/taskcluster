audience: users
level: minor
reference: issue 5995
---
Generic Worker: Adds `task.payload.feature.loopbackAudio` for loopback audio device support on Linux.

The `snd-aloop` kernel module must be installed on the host system for this feature to work, although it does not _need_ to be loaded. Generic Worker loads the module with `modprobe` and generates the virtual audio device with a `snd-aloop` command. Under the multiuser engine, it also manages file ownership of the device with `chown` to ensure that only tasks with suitable scopes have read/write access to the virtual device.

For tasks that enable the feature, the virtual audio device will be found at `/dev/snd`. Devices inside that directory will take the form `/dev/snd/controlC<DEVICE_NUMBER>`, `/dev/snd/pcmC<DEVICE_NUMBER>D0c`, `/dev/snd/pcmC<DEVICE_NUMBER>D0p`, `/dev/snd/pcmC<DEVICE_NUMBER>D1c`, and `/dev/snd/pcmC<DEVICE_NUMBER>D1p`, where `<DEVICE_NUMBER>` is an integer between 0 and 31, inclusive. The Generic Worker config setting `loopbackAudioDeviceNumber` may be used to change the device number in case the default value (`16`) conflicts with another audio device on the worker. Future releases of Generic Worker may provide the capability of having more than one virtual audio device; currently only one virtual audio device is supported.
