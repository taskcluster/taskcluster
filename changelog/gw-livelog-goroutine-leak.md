audience: worker-deployers
level: patch
---
Generic Worker no longer leaks goroutines in its livelog handling: one (along
with the livelog process output it holds) for every task that uses the
livelog feature, and one each time the livelog process exits before it is
ready.
