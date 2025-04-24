audience: users
level: patch
reference: issue 7664
---
Fix an issue where taskcluster would try to report checks to github that exceeded the max allowed length if the log contained long lines in its tail
