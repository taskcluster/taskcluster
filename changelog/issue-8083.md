audience: worker-deployers
level: patch
reference: issue 8083
---
Generic Worker (windows): adds retry logic around `CreateUserProfile` method to ensure the task user's profile path is created successfully before continuing on to `LoadUserProfile`.
