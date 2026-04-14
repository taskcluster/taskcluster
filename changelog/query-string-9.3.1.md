audience: general
level: silent
---
Remove query-string dependency from client-web and docker-worker,
replacing with built-in equivalents (inline stringify / URLSearchParams).
query-string v9+ is pure ESM with ES2020+ syntax, incompatible with
webpack 4 (client-web) and CommonJS require (docker-worker).
