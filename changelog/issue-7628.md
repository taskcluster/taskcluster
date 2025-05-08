audience: worker-deployers
level: minor
reference: issue 7628
---
Generic Worker: adds a `Metadata` feature (controlled with worker config `enableMetadata` [default: `true`], not controllable in the task payload) that writes out a file `generic-worker-metadata.json` (in the current working directory of the generic worker process) containing information about the last task run.

Currently, the file will look something like this:

```json
{
	"lastTaskUrl": "https://firefox-ci-tc.services.mozilla.com/tasks/Klc17PU-TMmo4axlfihKJQ/runs/0"
}
```

Additional data may be added to this file in future releases.
