audience: developers
level: patch
---
Generic worker per-task state (`TaskDir` and `User`) is now stored on the `TaskRun` struct instead of being read from the `taskContext` global during task execution. This is a refactoring step toward supporting parallel task execution. The `taskContext` global remains for worker-lifecycle operations (environment setup, garbage collection, purging) and will be removed in a future change.
