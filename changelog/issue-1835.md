level: patch
reference: issue 1835
---
Taskcluster now properly read the expires query parameter for whitelisted clients. It was previously creating clients using the maxExpires value. This issue was only seen with clients that are whitelisted.
