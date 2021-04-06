audience: worker-deployers
level: patch
reference: issue 4715
---
The worker-manager service now deprovisions workers when `removeWorker` is called and when the workers terminate themselves.  Previously it would wait forever for such workers to be deleted, without attempting that deletion.
