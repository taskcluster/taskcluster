audience: users
level: patch
reference: issue 6793
---
D2G will now ensure that tasks whose max run time is exceeded still have the chance to publish artifacts.
This means that Docker Worker tasks definitions that are run under Generic Worker and are aborted due to
hitting the max run time should still publish the artifacts from the aborted docker container they ran in.
