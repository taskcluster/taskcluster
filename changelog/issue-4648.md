audience: deployers
level: patch
reference: issue 4648
---
All services now have a `<service>.pulse_amqps` Helm configuration that controls whether to use amqps (with TLS) to communicate with the Pulse server.  The value defaults to true, matching current behavior, but can be set to false in cases where the AMQP server is local and encryption is unnecessary.
