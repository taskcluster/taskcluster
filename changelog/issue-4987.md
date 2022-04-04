audience: worker-deployers
level: patch
reference: issue 4987
---

Azure cannot create VMs without with Network interface. We create network interface always, but skip provisioning of public IP when it's not needed.
There might be a case where public IP is needed for RDP though.
