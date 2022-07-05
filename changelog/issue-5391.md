audience: developers
level: patch
reference: issue 5391
---

Skip github checks if github build is unkown.
This happens in periodic and manual hooks that are doing some periodic operations on github repo.
Those operations are not initiated by github, so there is no new build/check suite created for those events.
