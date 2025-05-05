audience: worker-deployers
level: patch
reference: issue 7685
---

Fixes node-forge issue with certificates being removed during chain verification process,
which allowed Azure `registerWorker()` calls fail after some time.
This happened when multiple certs had same subject hash but different issuers.
