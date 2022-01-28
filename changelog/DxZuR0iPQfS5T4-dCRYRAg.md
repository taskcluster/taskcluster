audience: general
level: minor
---
Node.js major update from 14.17.15 to 16.13.2, the latest LTS version.

Update the worker-ci image from Ubuntu 14.04 to 20.04, the current LTS version.
This image is used in Taskcluster CI testing. This includes Python 3.8 (as
python3), needed to build with node-gyp, and no longer includes Python 2.7.
It also updates the Docker engine from 18.06.3 to 20.10.12.
