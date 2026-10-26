audience: worker-deployers
level: patch
---
Generic Worker's websocket-to-TCP port exposure no longer leaks a goroutine for every connection. The handler now returns once both directions of the bridge have closed. Previously it waited on a `sync.WaitGroup` that was never decremented. Nothing in Generic Worker currently exposes TCP ports this way (livelog and interactive use HTTP exposure), so this has no effect in practice today.
