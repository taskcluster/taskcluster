audience: general
level: patch
reference: issue 6682
---

Tweaking `server.keepAliveTimeout` to fix downstream errors in reverse proxy and load balancer.
Default node's http server keepAliveTimeout is 5s which might be an issue when working behind a reverse proxy which has bigger timeouts.
To reduce number of `502` errors, application's keep alive timeout should be larger than the one of the reverse proxy,
and that in turn, should be larger than the Load Balancer's one.
