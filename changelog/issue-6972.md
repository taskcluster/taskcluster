audience: worker-deployers
level: patch
reference: issue 6972
---
Generic Worker now uploads task payload artifacts in parallel to decrease graceful termination time in the event of a spot termination.

The `insecure` engine no longer performs a file copy command as the task user before the artifact upload process happens to help speed up the process.

Generic Worker (posix only) now tries to put an exclusive file lock on artifacts before upload to prevent the file from being written to by any other process. This is done in lieu of copying the file to a temporary location which was achieving the same thing. If putting the lock on the file fails, Generic Worker will fallback to copying the file.
