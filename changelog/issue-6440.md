audience: users
level: patch
reference: issue 6440
---
Generic Worker now allocates a pseudo tty when running Docker Worker tasks, to
emulate Docker Worker behavior. Previously it did not allocate a tty, which
could result in e.g. output not being colored.
