audience: worker-deployers
level: major
reference: issue 8101
---
Generic worker now reports artifact file sizes to the queue via the optional `contentLength` parameter when creating artifacts. This applies to all file-based artifacts (S3 and object) as well as log artifacts. The reported size is the original file size on disk, before any encoding such as gzip compression.
This feature relies on the API changes introduced in [v96.7.0](https://github.com/taskcluster/taskcluster/blob/main/CHANGELOG.md#v9670) and will fail schema validation if services are not upgraded.
