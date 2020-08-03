audience: deployers
level: major
reference: issue 3216
---
The auth, github, hooks, index, and notify services no longer take Helm config `<service>.azure_account_id`, and auth no longer takes Helm config `auth.azure_account_key`, as these services no longer talk to Azure.
