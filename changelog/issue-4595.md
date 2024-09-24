audience: users
level: minor
reference: issue 4595
---
Generic Worker can now be run in headless mode, meaning tasks do not have a
dedicated graphical user environment. To do this, the Generic Worker config
setting `headlessTasks` should be set to true. This can only be enabled or
disabled at the Worker level, tasks cannot choose if they run in a headless
environment or not, it depends on the worker settings (i.e. the Worker Pool
configuration).

There are no reboots in headless mode, and multiple worker instances can
be run concurrently on the same host (e.g. Worker Pool definitions may have
`capacity` greater than one).

Furthermore, on Linux, Gnome Desktop is no longer required.
