audience: worker-deployers
level: patch
reference: issue 8318
---
Generic Worker & Livelog: fix intermittent "address already in use" error on livelog ports. When a livelog process failed to start, an orphaned goroutine would keep polling the port and later send a duplicate PUT request to the next task's livelog process, causing its GET server to fail binding. Fixed by cancelling the goroutine on early process exit, killing orphaned livelog processes on connection failure, and fixing the livelog binary's duplicate PUT request guard which was checked but never set.
