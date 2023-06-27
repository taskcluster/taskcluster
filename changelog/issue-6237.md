audience: general
level: patch
reference: issue 6237
---
Fix the case where a generic worker won't upload its log on a malformed payload error. This has been broken since v48.2.0 from PR [#6107](https://github.com/taskcluster/taskcluster/pull/6107).
