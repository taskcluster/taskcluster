audience: users
level: patch
reference: issue 6724
---
The UI no longer adds a `bewit` to artifact links when the `anonymous` role can read the artifact. This also fixes opening public artifacts for users with many roles, whose signed URLs were too long (#4333).
