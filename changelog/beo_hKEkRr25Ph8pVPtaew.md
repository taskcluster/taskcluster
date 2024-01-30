audience: worker-deployers
level: patch
---
Worker Runner now checks for termination notice when starting the Google provider.

When Worker Runner runs, the instance may already be scheduled to be shutdown. So on Google provider startup, we now check for this case.

This functionality mimics what's already in place for AWS.

This change also decreases the time Worker Runner checks to see if the instance is scheduled to be shutdown from 30 seconds to 15 seconds on the Google and Azure providers, as they each have a 30 second notice before a hard-shutdown Google: https://cloud.google.com/compute/docs/instances/spot#preemption-process Azure: https://learn.microsoft.com/en-us/azure/virtual-machines/spot-vms.
