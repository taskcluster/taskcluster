audience: users
level: patch
reference: issue 9339
---
UI: the worker pool Launch Configs page now labels its weight column "Capacity Weight" and computes it from capacity alone. For Google and Azure worker pools, worker-manager also lowers the weight of launch configurations that recently failed to launch workers, which the page cannot show.
