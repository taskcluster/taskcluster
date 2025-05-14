audience: users
level: minor
---

Pass /dev/nvidia* devices to `docker run` when `allowGPUs` is true. This works around the issue described in https://github.com/NVIDIA/nvidia-container-toolkit/issues/48, where GPUs disappear if a systemd daemon reload happens.
