audience: users
level: patch
reference: issue 6801
---

Fixes a bug in notify service where multiple messages to the same channel were not sent.
Adds `204` status code to the email, matrix, pulse, slack endoints when message was detected to be duplicate and was not sent.
