audience: general
level: patch
---
This change updates `d2g` to return the resulting generic worker payload with a `125` exit status code in the retry array to fix an intermittent podman issue while pulling the docker image.
