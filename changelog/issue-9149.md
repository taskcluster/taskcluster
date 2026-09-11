level: silent
reference: issue 9149
---
Defines the weekly Azure attested-document job in-tree, as a taskgraph cron job
(`.cron.yml` and `taskcluster/kinds/azure-attested-document`), and documents how
to refresh worker-manager's `azure_signature_good.json` fixture from its output.
