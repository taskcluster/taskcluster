audience: worker-deployers
level: major
reference: issue 8990
---
Generic worker has ipv6 enabled again for d2g tasks if it's enabled on the
default bridge. Due to how docker handles ipv6 on networks that are necessary
for capacity > 1, this raises the minimum docker version supported by generic
worker to 27.
