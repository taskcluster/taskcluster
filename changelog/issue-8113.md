audience: deployers
level: patch
reference: issue 8113
---
Worker-manager now tags instances and disks/volumes created by the Google and AWS providers with the deployment's `rootUrl` (label `root-url` in GCP, tag `RootUrl` in AWS), matching the Azure provider. This lets deployments sharing a cloud account tell their resources apart. GCP resources allow at most 64 labels, so worker pools already near that limit will get one extra label.
