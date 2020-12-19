audience: users
level: major
reference: issue 3773
---
Support for superseding has been removed.  See the linked issue for the detailed reasoning.  While workers still allow `supersederUrl` in payloads, it has no effect.  Older workers running with newer services that try to supersede tasks will encounter errors.  No known instances of superseding exist.
