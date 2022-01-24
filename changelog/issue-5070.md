audience: developers
level: silent
reference: issue 5070
---
The CI tasks now use the latest versions of the taskgraph code (cb3ae27,
committed 2022-01-19) and the mozillareleases/taskgraph image (e035c4bb, pushed
2021-07-19), as well as pip3, to ensure Python 3 instead of
Python 2.7 is used.

taskcluster/src/*.py has been (partially?) converted to Python 3.
