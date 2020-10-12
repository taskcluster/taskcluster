audience: general
level: major
reference: issue 3615
---
RFC 165 - anonymous API calls are now granted the `assume:anonymous` scope, in order that public API methods can be guarded from public view in private taskcluster deployments. Additionally, the scope expressions of all API customer-facing API methods now include `service:<serviceName>:<methodName>`. Since `service:*` is granted to the anonymous role in Community Taskcluster and Firefox CI Taskcluster, there should be no behavioural change to these taskcluster deployments. However, administrators of private taskcluster deployments can adjust the `anonymous` role in order to further restrict access to specific API methods.
