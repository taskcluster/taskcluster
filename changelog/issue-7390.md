audience: worker-deployers
level: minor
reference: issue 7390
---
Generic Worker: adds `d2gConfig.allowGPUs` (default: `false`) and `d2gConfig.gpus` (default: `all`) worker config to provide NVIDIA GPU access to the running container for d2g-translated task payloads.

The translation will add the gpus flag: `--gpus <d2gConfig.gpus>` to the `docker run ...` command. Read more about the usage [here](https://docs.docker.com/reference/cli/docker/container/run/#gpus).
