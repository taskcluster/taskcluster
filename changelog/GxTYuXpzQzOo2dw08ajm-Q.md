audience: worker-deployers
level: patch
---
D2G: Runs `nvidia-smi` to ensure that the `/dev/nvidia-uvm` and `/dev/nvidia-uvm-tools` devices are loaded and passed as `--device` flags.
