audience: deployers
level: patch
reference: issue 5079
---
The new `app.authRateLimitMaxRequests` configuration value allows setting the maximum number of web server requests per minute to help mitigate DoS attacks. Default is 5. Set to 0 to disable rate limiting.

Another configuration value, `app.numberOfProxies` was added to set the number of proxies between the user and the server to prevent the rate limiter from acting like a global one. Default is 0. A value of 0 means that the first untrusted address would be req.socket.remoteAddress, i.e. there is no reverse proxy.
