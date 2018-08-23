module "queue_user" {
  source = "modules/taskcluster-service-iam-user"
  name   = "taskcluster-queue"

  policy = <<EOF
{
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:GetObject",
                "s3:PutObject",
                "s3:DeleteObject",
                "s3:ListMultipartUploadParts",
                "s3:AbortMultipartUpload",
                "s3:PutObjectTagging",
                "s3:GetObjectTagging",
                "s3:DeleteObjectTagging"
            ],
            "Resource": [
              "${aws_s3_bucket.private_blobs.arn}",
              "${aws_s3_bucket.public_blobs.arn}"
            ]
        },
        {
            "Effect": "Allow",
            "Action": [
                "s3:GetObject",
                "s3:PutObject",
                "s3:DeleteObject"
            ],
            "Resource": [
              "${aws_s3_bucket.public_artifacts.arn}/*",
              "${aws_s3_bucket.private_artifacts.arn}/*"
            ]
        },
        {
            "Effect": "Allow",
            "Action": [
                "s3:GetBucketLocation",
                "s3:ListBucket",
                "s3:PutBucketCORS"
            ],
            "Resource": [
              "${aws_s3_bucket.public_artifacts.arn}",
              "${aws_s3_bucket.private_artifacts.arn}"
            ]
        }
    ]
}
EOF
}

module "queue_rabbitmq_user" {
  source         = "modules/rabbitmq-user"
  project_name   = "taskcluster-queue"
  rabbitmq_vhost = "${var.rabbitmq_vhost}"
}

// TODO: On advice of ajvb, swap these out for stored secrets from
//       sops
resource "random_string" "queue_access_token" {
  length           = 65
  override_special = "_-"
}

module "queue_secrets" {
  source            = "modules/service-secrets"
  project_name      = "taskcluster-queue"
  disabled_services = "${var.disabled_services}"

  secrets = {
    DEBUG                            = "*"
    NODE_ENV                         = "production"
    MONITORING_ENABLE                = "false"
    PUBLISH_METADATA                 = "false"
    AWS_ACCESS_KEY_ID                = "${module.queue_user.access_key_id}"
    AWS_SECRET_ACCESS_KEY            = "${module.queue_user.secret_access_key}"
    TASKCLUSTER_CLIENT_ID            = "static/taskcluster/queue"
    TASKCLUSTER_ACCESS_TOKEN         = "${random_string.queue_access_token.result}"
    AZURE_ACCOUNT_ID                 = "${azurerm_storage_account.base.name}"
    AZURE_ACCOUNT_KEY                = "${azurerm_storage_account.base.primary_access_key}"
    PULSE_USERNAME                   = "taskcluster-queue"
    PULSE_PASSWORD                   = "${module.queue_rabbitmq_user.password}"
    PULSE_HOSTNAME                   = "${var.rabbitmq_hostname}"
    PULSE_VHOST                      = "${var.rabbitmq_vhost}"
    BLOB_ARTIFACT_REGION             = "${data.aws_region.current.name}"
    ARTIFACT_REGION                  = "${data.aws_region.current.name}"
    USE_PUBLIC_ARTIFACT_BUCKET_PROXY = "false"
    PUBLIC_BLOB_ARTIFACT_BUCKET      = "${aws_s3_bucket.public_blobs.id}"
    PRIVATE_BLOB_ARTIFACT_BUCKET     = "${aws_s3_bucket.private_blobs.id}"
    PUBLIC_ARTIFACT_BUCKET           = "${aws_s3_bucket.public_artifacts.id}"
    PRIVATE_ARTIFACT_BUCKET          = "${aws_s3_bucket.private_artifacts.id}"
  }
}

module "queue_web_service" {
  source            = "modules/web-service"
  project_name      = "taskcluster-queue"
  service_name      = "queue"
  disabled_services = "${var.disabled_services}"
  secret_name       = "${module.queue_secrets.secret_name}"
  secrets_hash      = "${module.queue_secrets.secrets_hash}"
  root_url          = "${var.root_url}"
  secret_keys       = "${module.queue_secrets.env_var_keys}"
  docker_image      = "${local.taskcluster_image_queue}"
}

module "queue_expire_artifacts" {
  source           = "modules/scheduled-job"
  project_name     = "taskcluster-queue"
  job_name         = "expireArtifacts"
  schedule         = "0 0 * * *"
  deadline_seconds = 86400
  secret_name      = "${module.queue_secrets.secret_name}"
  secrets_hash     = "${module.queue_secrets.secrets_hash}"
  root_url         = "${var.root_url}"
  secret_keys      = "${module.queue_secrets.env_var_keys}"
  docker_image     = "${local.taskcluster_image_queue}"
}

module "queue_expire_task" {
  source           = "modules/scheduled-job"
  project_name     = "taskcluster-queue"
  job_name         = "expireTask"
  schedule         = "0 0 * * *"
  deadline_seconds = 86400
  secret_name      = "${module.queue_secrets.secret_name}"
  secrets_hash     = "${module.queue_secrets.secrets_hash}"
  root_url         = "${var.root_url}"
  secret_keys      = "${module.queue_secrets.env_var_keys}"
  docker_image     = "${local.taskcluster_image_queue}"
}

module "queue_expire_queues" {
  source           = "modules/scheduled-job"
  project_name     = "taskcluster-queue"
  job_name         = "expireQueues"
  schedule         = "0 0 * * *"
  deadline_seconds = 86400
  secret_name      = "${module.queue_secrets.secret_name}"
  secrets_hash     = "${module.queue_secrets.secrets_hash}"
  root_url         = "${var.root_url}"
  secret_keys      = "${module.queue_secrets.env_var_keys}"
  docker_image     = "${local.taskcluster_image_queue}"
}

module "queue_expire_task_requirement" {
  source           = "modules/scheduled-job"
  project_name     = "taskcluster-queue"
  job_name         = "expireTaskRequirement"
  schedule         = "0 0 * * *"
  deadline_seconds = 86400
  secret_name      = "${module.queue_secrets.secret_name}"
  secrets_hash     = "${module.queue_secrets.secrets_hash}"
  root_url         = "${var.root_url}"
  secret_keys      = "${module.queue_secrets.env_var_keys}"
  docker_image     = "${local.taskcluster_image_queue}"
}

module "queue_expire_task_dependency" {
  source           = "modules/scheduled-job"
  project_name     = "taskcluster-queue"
  job_name         = "expireTaskDependency"
  schedule         = "0 0 * * *"
  deadline_seconds = 86400
  secret_name      = "${module.queue_secrets.secret_name}"
  secrets_hash     = "${module.queue_secrets.secrets_hash}"
  root_url         = "${var.root_url}"
  secret_keys      = "${module.queue_secrets.env_var_keys}"
  docker_image     = "${local.taskcluster_image_queue}"
}

module "queue_expire_task_groups" {
  source           = "modules/scheduled-job"
  project_name     = "taskcluster-queue"
  job_name         = "expireTaskGroups"
  schedule         = "0 0 * * *"
  deadline_seconds = 86400
  secret_name      = "${module.queue_secrets.secret_name}"
  secrets_hash     = "${module.queue_secrets.secrets_hash}"
  root_url         = "${var.root_url}"
  secret_keys      = "${module.queue_secrets.env_var_keys}"
  docker_image     = "${local.taskcluster_image_queue}"
}

module "queue_expire_task_group_members" {
  source           = "modules/scheduled-job"
  project_name     = "taskcluster-queue"
  job_name         = "expireTaskGroupMembers"
  schedule         = "0 0 * * *"
  deadline_seconds = 86400
  secret_name      = "${module.queue_secrets.secret_name}"
  secrets_hash     = "${module.queue_secrets.secrets_hash}"
  root_url         = "${var.root_url}"
  secret_keys      = "${module.queue_secrets.env_var_keys}"
  docker_image     = "${local.taskcluster_image_queue}"
}

module "queue_expire_task_group_sizes" {
  source           = "modules/scheduled-job"
  project_name     = "taskcluster-queue"
  job_name         = "expireTaskGroupSizes"
  schedule         = "0 0 * * *"
  deadline_seconds = 86400
  secret_name      = "${module.queue_secrets.secret_name}"
  secrets_hash     = "${module.queue_secrets.secrets_hash}"
  root_url         = "${var.root_url}"
  secret_keys      = "${module.queue_secrets.env_var_keys}"
  docker_image     = "${local.taskcluster_image_queue}"
}

module "queue_expire_worker_info" {
  source           = "modules/scheduled-job"
  project_name     = "taskcluster-queue"
  job_name         = "expireWorkerInfo"
  schedule         = "0 0 * * *"
  deadline_seconds = 86400
  secret_name      = "${module.queue_secrets.secret_name}"
  secrets_hash     = "${module.queue_secrets.secrets_hash}"
  root_url         = "${var.root_url}"
  secret_keys      = "${module.queue_secrets.env_var_keys}"
  docker_image     = "${local.taskcluster_image_queue}"
}

