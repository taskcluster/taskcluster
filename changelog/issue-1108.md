level: patch
reference: issue #1108
---
The development process has been improved to use kubectl directly instead of helm.
Helm is still used to render templates because we need to support it.
