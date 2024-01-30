audience: worker-deployers
level: patch
reference: issue 6802
---
Worker Runner no longer polls the metadata service for the Google provider. Instead, we've added `?wait_for_change=true` to the endpoint to perform a hanging GET request that'll return as soon as the metadata has changed and the VM has been preempted.
