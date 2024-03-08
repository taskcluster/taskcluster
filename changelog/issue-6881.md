audience: users
level: major
reference: issue 6881
---
Google cloud workers spawned by Worker Manager now have `workerGroup` set to
the Google Cloud _Zone_ (e.g. `us-east1-d`) rather than the Google Cloud
_Region_ (e.g. `us-east1`). This makes it easier to issue api requests against
an instance, e.g. `gcloud compute instances delete <workerId>
--zone=<workerGroup>`.
