audience: worker-deployers
level: minor
---
Change `adduser` usage to `useradd`

`adduser` is a debian specific wrapper around `useradd` and friends. By
changing to `useradd`, we allow workers to be deployed on non debian
derivative distributions.

Generic Worker multiuser engine on Linux/FreeBSD now depends on:

  * /usr/bin/chfn
  * /usr/sbin/useradd
  * /usr/sbin/userdel

and no longer depends on:

  * /usr/sbin/adduser
  * /usr/sbin/deluser
