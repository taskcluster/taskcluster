audience: users
level: patch
reference: issue 6521
---
Generic Worker now outputs a warning in the task log if a Docker Worker payload is supplied, together with the
d2g-converted task definition, in order to help users migrate their tasks to native Generic Worker format.
