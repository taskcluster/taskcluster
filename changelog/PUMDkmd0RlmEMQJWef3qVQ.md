audience: worker-deployers
level: minor
---
Change `adduser` usage to `useradd`

`adduser` is a debian specific wrapper around `useradd` and friends. By
changing to `useradd`, we allow workers to be deployed on non debian
derivative distributions.
