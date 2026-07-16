audience: worker-deployers
level: patch
reference: issue 8859
---
generic-worker (multiuser engine, macOS) now determines that the task user is
ready by running `id -un` through the task user's launch agent and checking it
reports the expected user, instead of parsing `last -t console` output. Because
the probe only succeeds once the user's Aqua session is up and its launch agent
is serving, the worker no longer claims a task before it can actually run
commands as the task user (which resolved as `exception`/`internal-error`, e.g.
when a boot-time macOS installer held the login window). This also removes the
fragile `last` output parsing (issue 5006).
