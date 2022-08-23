audience: worker-deployers
level: patch
reference: issue 5634
---
The livelog docker image used by docker-worker now is not based on busybox, but
contains only the livelog binary, /etc/ssl/certs/ca-certificates.crt and an
empty /tmp directory. This effectively reverses the change from #3866.
