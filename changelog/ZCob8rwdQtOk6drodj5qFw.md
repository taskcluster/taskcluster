audience: users
level: minor
---
Generic Worker now downloads the content of a task's file and read-only directory mounts in parallel (up to 8 at a time) before mounting them, rather than one after another. Mounts are still mounted sequentially in the order they are listed in the payload. Content of preloaded writable directory caches is still only downloaded if no existing cache can be reused.
