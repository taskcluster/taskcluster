level: patch
audience: admins
reference: issue 9156
---
Worker-pool errors from failed Azure ARM deployments now include the nested, actionable ARM error in the error description. This makes errors like "image X was not found in <region>" visible in the UI and API.
