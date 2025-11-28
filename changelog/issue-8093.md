audience: developers
level: minor
reference: issue 8093
---
Github webhook endpoint returns 200 instead of 400 for unsupported events. 200 means we received and processed webhook,
even if we don't actually support such event at the moment. 400 is only for validation issues.
