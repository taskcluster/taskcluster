audience: developers
level: patch
reference: issue 4934
---
When running ``yarn dev:init``, store the RabbitMQ cluster management API
origin at ``meta.rabbitAdminManagementOrigin`` rather than the root key
``rabbitAdminManagementOrigin``.  This avoids a schema validation error when
running ``yarn dev:apply``. If you've already run ``yarn dev:init``, then you
can manually move ``rabbitAdminManagementOrigin`` in ``dev-config.yml``.
