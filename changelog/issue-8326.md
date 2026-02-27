audience: worker-deployers
level: patch
reference: issue 8326
---
Generic Worker: when running with worker-runner, the worker now checks with Worker Manager before shutting down due to idle timeout. If Worker Manager says the worker is still needed (e.g., to satisfy `minCapacity`), the idle timer resets instead of shutting down. Workers not running with worker-runner are unaffected.
