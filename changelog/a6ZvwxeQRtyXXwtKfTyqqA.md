audience: developers
level: silent
---
The Cloud Build deploy image now installs the Google Cloud CLI using the current apt package names and keyring setup. The renamed `google-cloud-cli-gke-gcloud-auth-plugin` package replaces the removed `google-cloud-sdk-gke-gcloud-auth-plugin`.

Upgrades to the latest stable `kubectl` version (v1.37.0).
