audience: developers
level: patch
reference: issue 3789
---
Fixed an issue where when there's no more data, the continuationToken property was not being omitted, but being returned as just an empty string. Depending on implementation, that could cause a caller to loop endlessly calling the purge cache endpoint.
