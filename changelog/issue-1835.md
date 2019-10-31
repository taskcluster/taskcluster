level: patch
reference: issue 1835
---
Taskcluster now properly read the expires query parameter for whitelisted third-party login clients.
It was previously creating third-party login clients using the maxExpires value.
This issue was only seen with clients that are whitelisted.
