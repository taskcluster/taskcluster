audience: worker-deployers
level: patch
reference: issue 8083
---
Generic Worker (windows): waits for the User Profile Service (`ProfSvc`) to be running before performing profile operations on first boot, and fixes a bug where `LoadUserProfile` retry logic for "device not ready" errors never actually retried due to an incorrect error type assertion.
