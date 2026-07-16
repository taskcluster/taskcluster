audience: users
level: patch
reference: issue 8863
---
Fix for Generic Worker multiuser (non-headless) bug where occasionally tasks
would resolve as `exception/claim-expired`. The cause was a race condition
allowing a second task to be claimed just before rebooting. That task could
never be resolved by the worker, so the Queue service would eventually resolve
it as `exception/claim-expired`.
