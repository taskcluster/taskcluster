audience: deployers
level: patch
reference: issue 3588
---
Database URLs can now be specified in the configuration with `ssl=authorized`, in which case Taskcluster will validate the Postgres server's SSL/TLS certificate against trusted root CAs.  It is unusual for databases to be deployed with such certificates.  See [the documentation](https://docs.taskcluster.net/docs/manual/deploying/database#configuration) for details.
