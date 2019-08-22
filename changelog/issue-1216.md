level: patch
reference: issue 1216
---

Users of taskcluster-ui are now logged out if they are not logged-in in the eyes of web-server.
This would avoid having web-server be out-of-sync when restarted for example.
