audience: developers
level: major
reference: issue 2791
---

Hashes for object upload and download are now more precisely defined: uploaders
should supply all acceptable hash algorithms, and downloaders should verify all
recognized algorihtms and ensure that at least one is present.  This has the
effect of a breaking change in the Go client types, leading to this change's
designation as major.
