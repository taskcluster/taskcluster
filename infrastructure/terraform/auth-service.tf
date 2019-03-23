module "auth_user" {
  source = "modules/taskcluster-service-iam-user"
  name   = "taskcluster-auth"
  prefix = "${var.prefix}"

  policy = <<EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": "sts:GetFederationToken",
            "Resource": "arn:aws:sts::${data.aws_caller_identity.current.account_id}:federated-user/TemporaryS3ReadWriteCredentials"
        },
        {
            "Effect": "Allow",
            "Action": [
                "s3:DeleteObject",
                "s3:GetObject",
                "s3:PutObject",
                "s3:PutObjectAcl",
                "s3:ListBucket",
                "s3:GetBucketLocation"
            ],
            "Resource": [
              "${aws_s3_bucket.backups.arn}",
              "${aws_s3_bucket.backups.arn}/*"
            ]
        }
    ]
}
EOF
}

resource "random_string" "auth_table_signing_key" {
  length = 40
}

resource "random_string" "auth_table_crypto_key" {
  length = 32
}

resource "random_string" "auth_root_access_token" {
  length           = 65
  override_special = "_-"
}

resource "random_string" "auth_websocktunnel_secret" {
  length = 66
}

module "auth_rabbitmq_user" {
  source         = "modules/rabbitmq-user"
  prefix         = "${var.prefix}"
  project_name   = "taskcluster-auth"
  rabbitmq_vhost = "${var.rabbitmq_vhost}"
}

locals {
  static_clients = [
    {
      clientId    = "static/taskcluster/secrets"
      accessToken = "${random_string.secrets_access_token.result}"
      description = "..."

      scopes = [
        "auth:azure-table-access:${azurerm_storage_account.base.name}/Secrets",
        "auth:azure-table:read-write:${azurerm_storage_account.base.name}/Secrets",
      ]
    },
    {
      clientId    = "static/taskcluster/index"
      accessToken = "${random_string.index_access_token.result}"
      description = "..."

      scopes = [
        "auth:azure-table-access:${azurerm_storage_account.base.name}/IndexedTasks",
        "auth:azure-table-access:${azurerm_storage_account.base.name}/Namespaces",
        "auth:azure-table:read-write:${azurerm_storage_account.base.name}/IndexedTasks",
        "auth:azure-table:read-write:${azurerm_storage_account.base.name}/Namespaces",
        "queue:get-artifact:*",
      ]
    },
    {
      clientId    = "static/taskcluster/worker-manager"
      accessToken = "${random_string.worker_manager_access_token.result}"
      description = "..."

      scopes = []
    },
    {
      clientId    = "static/taskcluster/github"
      accessToken = "${random_string.github_access_token.result}"
      description = "..."

      scopes = [
        "assume:repo:github.com/*",
        "assume:scheduler-id:taskcluster-github/*",
        "auth:azure-table-access:${azurerm_storage_account.base.name}/TaskclusterGithubBuilds",
        "auth:azure-table-access:${azurerm_storage_account.base.name}/TaskclusterIntegrationOwners",
        "auth:azure-table:read-write:${azurerm_storage_account.base.name}/TaskclusterGithubBuilds",
        "auth:azure-table:read-write:${azurerm_storage_account.base.name}/TaskclusterIntegrationOwners",
        "auth:azure-table:read-write:${azurerm_storage_account.base.name}/TaskclusterChecksToTasks",
        "auth:azure-table:read-write:${azurerm_storage_account.base.name}/TaskclusterCheckRuns",
      ]
    },
    {
      clientId    = "static/taskcluster/hooks"
      accessToken = "${random_string.hooks_access_token.result}"
      description = "..."

      scopes = [
        "auth:azure-table:read-write:${azurerm_storage_account.base.name}/Hooks",
        "auth:azure-table:read-write:${azurerm_storage_account.base.name}/Queue",
        "auth:azure-table:read-write:${azurerm_storage_account.base.name}/LastFire",
        "assume:hook-id:*",
        "notify:email:*",
        "queue:create-task:*",
      ]
    },
    {
      clientId    = "static/taskcluster/notify"
      accessToken = "${random_string.notify_access_token.result}"
      description = "..."

      scopes = [
        "auth:azure-table:read-write:${azurerm_storage_account.base.name}/DenylistedNotification",
      ]
    },
    {
      clientId    = "static/taskcluster/built-in-workers"
      accessToken = "${random_string.built_in_workers_access_token.result}"
      description = "..."

      scopes = [
        "queue:claim-work:built-in/*",
        "assume:worker-id:built-in/*",
        "queue:worker-id:built-in/*",
        "queue:resolve-task",
      ]
    },
    {
      clientId    = "static/taskcluster/queue"
      accessToken = "${random_string.queue_access_token.result}"
      description = "..."

      scopes = ["*"]
    },
    {
      clientId    = "static/taskcluster/root"
      accessToken = "${random_string.auth_root_access_token.result}"
      description = "..."
      scopes      = ["*"]
    },
  ]
}
