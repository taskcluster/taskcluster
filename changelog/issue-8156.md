audience: deployers
level: patch
reference: issue 8074
---
Fixes pulse consumer issue where services would assert the queue exists as a quorum queue and woudln't fall back to classic type as a backwards compatibility followup solution to #8156.
