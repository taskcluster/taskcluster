# Taskcluster Worker Starter

This repository defines a utility for starting workers.

It handles:

 - Getting Taskcluster credentials
 - Interacting with the worker manager
 - Gathering configuration from various sources
 - Workers which reboot as part of their handling of tasks
 - Managing autologin
 - Polling for changed deployment IDs and signalling to workers when they should stop
