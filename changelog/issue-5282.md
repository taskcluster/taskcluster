audience: users
level: patch
reference: issue 5282
---

Fix issue with unicode characters in user profile.

Using Github as oauth provider encodes user profile using base64 encoding,
which, if contains unicode characters, is not decoded properly by `atob()`.
