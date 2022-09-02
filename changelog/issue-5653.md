audience: general
level: patch
reference: issue 5653
---
Fix a bug with github status checks not being updated.

In 44.19.1 release github service started tracking additional task
state changes, and this resulted in a race condition between "taskDefined"
and "status" handlers where both of them would create new check run at
the same time. Wrong check run would later get all status updates, while
Github UI will be showing a different check run which didn't receive all
the updates.
