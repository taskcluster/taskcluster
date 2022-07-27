audience: users
level: patch
reference: issue 5555
---
This patch fixes an issue with filtering workers based on quarantined status. The issue only occurs with static workers that are quarantined. When the filter was active, those static, quarantined workers would not be displayed in the list. This issue was first brought up in v44.17.0.
