audience: worker-deployers
level: patch
---
Worker Runner: adds additional logging around sending `graceful-termination` request to worker.

Worker Runner (windows): fixes protocol pipe connection so that Generic Worker can communicate with Worker Runner. This allows `graceful-termination` requests to be properly sent and received, among other message types. You must include `--with-worker-runner` in your Generic Worker service configuration on the `run` subcommand.
