audience: developers
level: patch
reference: issue 7080
---

Fixes github service issue during cancellation of the previous runs that were not created.
Response code was not checked properly which resulted in sending same error for each new build.
