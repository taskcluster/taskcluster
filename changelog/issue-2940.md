audience: general
level: patch
reference: issue 2940
---
Resolved tasks do not drop deadline messages, which was removed during queue refactoring.
Messages will stay until task deadline even if task is being resolved.
