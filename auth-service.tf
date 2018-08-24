module "auth_user" {
  source = "modules/taskcluster-service-iam-user"
  name   = "taskcluster-auth"

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

module "auth_rabbitmq_user" {
  source         = "modules/rabbitmq-user"
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
    AZURE_ACCOUNT_KEY     = "${azurerm_storage_account.base.primary_access_key}"
    AZURE_ACCOUNT         = "${azurerm_storage_account.base.name}"

    AZURE_ACCOUNTS = "${jsonencode(map(
      "${azurerm_storage_account.base.name}", "${azurerm_storage_account.base.primary_access_key}",
    ))}"

    STATIC_CLIENTS    = "${jsonencode(local.static_clients)}"
    PULSE_HOSTNAME    = "${var.rabbitmq_hostname}"
    PULSE_VHOST       = "${var.rabbitmq_vhost}"
    PULSE_USERNAME    = "taskcluster-auth"
    PULSE_PASSWORD    = "${module.auth_rabbitmq_user.password}"
    AZURE_CRYPTO_KEY  = "${base64encode(random_string.auth_table_crypto_key.result)}"
    AZURE_SIGNING_KEY = "${random_string.auth_table_signing_key.result}"

    FORCE_SSL               = "false"
    TRUST_PROXY             = "true"
    LOCK_ROLES              = "false"
    MONITORING_ENABLE       = "false"
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
