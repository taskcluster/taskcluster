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
        },
        {
            "Effect": "Allow",
            "Action": [
                "kinesis:PutRecord",
                "kinesis:DescribeStream"
            ],
            "Resource": [
                "${var.audit_log_stream}"
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

module "auth_rabbitmq_user" {
  source         = "modules/rabbitmq-user"
  prefix         = "${var.prefix}"
  project_name   = "taskcluster-auth"
  rabbitmq_vhost = "${var.rabbitmq_vhost}"
}

locals {
  audit_log_name = "${element(split("stream/", var.audit_log_stream), 1)}"

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

      scopes = []
    },
    {
      clientId    = "static/taskcluster/gce-provider"
      accessToken = "${random_string.gce_provider_access_token.result}"
      description = "..."

      scopes = [
        "queue:claim-work:gce-provider/*",
        "assume:worker-id:*",
        "assume:worker-type:gce-provider/*",
        "queue:worker-id:gce-worker-test/*",                               // TODO: Probably not right
        "auth:create-client:worker/gce/${var.gce_provider_gcp_project}/*",
      ]
    },
    {
      clientId    = "static/taskcluster/events"
      accessToken = "${random_string.events_access_token.result}"
      description = "..."

      scopes = []
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

module "auth_secrets" {
  source            = "modules/service-secrets"
  project_name      = "taskcluster-auth"
  disabled_services = "${var.disabled_services}"

  secrets = {
    AWS_ACCESS_KEY_ID     = "${module.auth_user.access_key_id}"
    AWS_SECRET_ACCESS_KEY = "${module.auth_user.secret_access_key}"
    AWS_REGION            = "${var.aws_region}"
    AZURE_ACCOUNT_KEY     = "${azurerm_storage_account.base.primary_access_key}"
    AZURE_ACCOUNT         = "${azurerm_storage_account.base.name}"

    AZURE_ACCOUNTS = "${jsonencode(map(
      "${azurerm_storage_account.base.name}", "${azurerm_storage_account.base.primary_access_key}",
    ))}"

    STATIC_CLIENTS    = "${jsonencode(local.static_clients)}"
    PULSE_HOSTNAME    = "${var.rabbitmq_hostname}"
    PULSE_VHOST       = "${var.rabbitmq_vhost}"
    PULSE_USERNAME    = "${module.auth_rabbitmq_user.username}"
    PULSE_PASSWORD    = "${module.auth_rabbitmq_user.password}"
    AZURE_CRYPTO_KEY  = "${base64encode(random_string.auth_table_crypto_key.result)}"
    AZURE_SIGNING_KEY = "${random_string.auth_table_signing_key.result}"

    AUDIT_LOG               = "${local.audit_log_name}"
    FORCE_SSL               = "false"
    TRUST_PROXY             = "true"
    LOCK_ROLES              = "false"
    MONITORING_ENABLE       = "true"
    NODE_ENV                = "production"
    OWNER_EMAIL             = "bstack@mozilla.com"
    PROFILE                 = "production"
    PUBLISH_METADATA        = "false"
    SENTRY_API_KEY          = "TODO SENTRY 4"
    SENTRY_DSN              = "TODO"
    SENTRY_AUTH_TOKEN       = "TODO"
    STATSUM_API_SECRET      = "TODO"
    STATSUM_BASE_URL        = "TODO"
    WEBHOOKTUNNEL_PROXY_URL = "TODO"
    WEBHOOKTUNNEL_SECRET    = "TODO"
    DEBUG                   = "*"
  }
}

module "auth_web_service" {
  source            = "modules/deployment"
  project_name      = "taskcluster-auth"
  disabled_services = "${var.disabled_services}"
  service_name      = "auth"
  proc_name         = "web"
  readiness_path    = "/api/auth/v1/ping"
  secret_name       = "${module.auth_secrets.secret_name}"
  secrets_hash      = "${module.auth_secrets.secrets_hash}"
  root_url          = "${var.root_url}"
  secret_keys       = "${module.auth_secrets.env_var_keys}"
  docker_image      = "${local.taskcluster_image_auth}"
}

module "auth_purge_expired_clients" {
  source           = "modules/scheduled-job"
  project_name     = "taskcluster-auth"
  job_name         = "purgeExpiredClients"
  schedule         = "0 0 * * *"
  deadline_seconds = 86400
  secret_name      = "${module.auth_secrets.secret_name}"
  secrets_hash     = "${module.auth_secrets.secrets_hash}"
  root_url         = "${var.root_url}"
  secret_keys      = "${module.auth_secrets.env_var_keys}"
  docker_image     = "${local.taskcluster_image_auth}"
}
