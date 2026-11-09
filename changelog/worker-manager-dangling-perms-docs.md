level: patch
audience: deployers
---
The worker-manager deployment docs now list the cloud permissions needed by the `check-dangling-resources` cron job (added in v115.0.0): `ec2:DescribeVolumes` in the AWS IAM policy example, and `Microsoft.Resources/subscriptions/resources/read` in the Azure custom role example. The Azure role must be assigned at subscription scope, as the docs already describe. GCP needs no change, since `roles/compute.admin` already covers it. Deployments whose credentials only have the previously documented permissions report `listErrors: 1` for that provider in the job's summary.
