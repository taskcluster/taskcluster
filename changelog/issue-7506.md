audience: users
level: minor
reference: issue 7506
---
Generic Worker Chain Of Trust feature now allows tasks to inject additional
data into `public/chain-of-trust.json`. Tasks wishing to add additional fields
should write them as json to the file `chain-of-trust-additional-data.json` in
the task directory. In this initial release, there are no provisions to
customise the name or path of the file. The file contents will be merged with
the default chain of trust certificate, with the default field values taking
precedence over any provided in `chain-of-trust-additional-data.json`. If the
file is not created by the task, no merging will take place, and the feature
will operate as before.
