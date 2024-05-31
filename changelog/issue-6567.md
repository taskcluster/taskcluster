audience: developers
level: patch
reference: issue 6567
---

`yarn generate` commands will attempt to run `pg_dump` inside the docker container if local binary is missing or its version is different from the server version.
