audience: users
level: patch
reference: issue 9265
---
taskcluster-proxy no longer stalls for minutes when its upstream connection silently stops working. It now pings HTTP/2 connections that receive nothing for 30 seconds and closes them if the ping isn't answered within 15 seconds, so pending requests are retried on a new connection. Upstream requests are also cancelled when the client disconnects, and credential updates no longer wait for (or block) pending requests.
