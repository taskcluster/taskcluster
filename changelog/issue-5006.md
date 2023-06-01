audience: worker-deployers
level: patch
reference: issue 5006
---
Generic Worker on macOS now dumps the output of the `last` command when it is not able to determine the logged in console user. This doesn't solve issue 5006 but it may provide additional troubleshooting information.
