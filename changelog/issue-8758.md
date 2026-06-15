audience: users
level: patch
reference: issue 8758
---
The hooks service now properly forwards network errors from failures to contact
the queue service instead of masking it with some serialization error
