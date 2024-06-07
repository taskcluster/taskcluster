audience: deployers
level: minor
reference: issue 7035
---

Helm chart allows conditional deployment of several resource types:
- Secret
- ConfigMap
- Ingress
- ServiceAccount

This might be useful in the deployments that use custom Ingress or manage secrets and configs externally.
Example usage: `helm template --values .. --set "skipResourceTypes[0]"=ingress --set "skipResourceTypes[0]"=secert .`
