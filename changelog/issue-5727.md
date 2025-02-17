audience: users
level: patch
reference: issue 5727
---
Fixes an issue introduced in Generic Worker 81.0.0 where the Chain of Trust
certificate would not contain all of the additional data specified in the
task-provided `chain-of-trust-additional-data.json` file.

Generic Worker 81.0.0 enhanced the Chain of Trust task payload feature to
support adding arbitrary additional data to the `public/chain-of-trust.json`
artifact. This was implemented in [PR
#7507](https://github.com/taskcluster/taskcluster/pull/7507) by allowing the
task to write additional data to the file `chain-of-trust-additional-data.json`
in the task directory. The feature was meant to merge the content of this file
with the generated `chain-of-trust.json` file before publishing it as an
artifact. However, the merge of the two json objects was broken if they
contained common ancestors.  For example, the generated `chain-of-trust.json`
file contains a top level object property `environment`. If the task-provided
`chain-of-trust-additional-data.json` file also contained a top level object
property `environment` containing further properties, they would be omitted
from the resulting `environment` property in the published Chain of Trust
certificate.
