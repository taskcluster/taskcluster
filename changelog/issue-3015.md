audience: worker-deployers
level: patch
reference: issue 3015
---
Generic-worker no longer supports the `--configure-for-{aws,gcp,azure}` options.  Instead, the expectation is that generic-worker will be started by worker-runner.  While it remains possible to run generic-worker without worker-runner in a "static" configuration, cloud-based deployments using worker-manager now require worker-runner.
