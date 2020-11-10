audience: users
level: patch
reference: issue 3884
---
Clients created with third-party sign-in (e.g., `taskcluster signin`) will no longer be disabled if they contain `assume:anonymous` or scopes in that role.
