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

module "auth_secrets" {
  source       = "modules/service-secrets"
  service_name = "taskcluster-auth"

  secrets = {
    AWS_ACCESS_KEY_ID     = "${module.auth_user.access_key_id}"
    AWS_SECRET_ACCESS_KEY = "${module.auth_user.secret_access_key}"
    AZURE_ACCOUNT_KEY     = "${azurerm_storage_account.base.primary_access_key}"
    AZURE_ACCOUNT_NAME    = "${azurerm_storage_account.base.name}"

    AZURE_ACCOUNTS = "${jsonencode(map(
      "${azurerm_storage_account.base.name}", "${azurerm_storage_account.base.primary_access_key}",
    ))}"

    ROOT_ACCESS_TOKEN = "${random_string.auth_root_access_token.result}"
    PULSE_USERNAME    = "${var.auth_pulse_username}"
    PULSE_PASSWORD    = "${var.auth_pulse_password}"
    TABLE_CRYPTO_KEY  = "${base64encode(random_string.auth_table_crypto_key.result)}"
    TABLE_SIGNING_KEY = "${random_string.auth_table_signing_key.result}"

    LOCK_ROLES              = "false"
    MONITORING_ENABLE       = "false"
    NODE_ENV                = "production"
    OWNER_EMAIL             = "bstack@mozilla.com"
    PROFILE                 = "production"
    PUBLISH_METADATA        = "false"
    SENTRY_API_KEY          = "TODO"
    SENTRY_DSN              = "TODO"
    STATSUM_API_SECRET      = "TODO"
    STATSUM_BASE_URL        = "TODO"
    WEBHOOKTUNNEL_PROXY_URL = "TODO"
    WEBHOOKTUNNEL_SECRET    = "TODO"
  }
}
