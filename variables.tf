variable "prefix" {
  type        = "string"
  description = "Short prefix applied to all cloud resources needed for a taskcluster cluster to function. This should be different for each deployment sharing a cloud account."
}

variable "azure_region" {
  type        = "string"
  description = "Region of azure storage"
}

variable "kubernetes_namespace" {
  default     = "taskcluster"
  type        = "string"
  description = "Optional namespace to run services in"
}

variable "root_url" {
  type        = "string"
  description = "Taskcluster rootUrl"
}

variable "rabbitmq_hostname" {
  type        = "string"
  description = "rabbitmq hostname"
}

variable "rabbitmq_vhost" {
  type        = "string"
  description = "rabbitmq hostname"
}

variable "notify_ses_arn" {
  type        = "string"
  description = "arn of an ses address. This must be manually set up in aws."
}

variable "disabled_services" {
  type        = "list"
  default     = []
  description = "List of services to disable i.e. [\"taskcluster-notify\"]"
}

variable "cluster_name" {
  type        = "string"
  description = "Human readable cluster name"
}

variable "irc_name" {
  type        = "string"
  description = "username for irc bot."
}

variable "irc_nick" {
  type        = "string"
  description = "nick for irc bot."
}

variable "irc_real_name" {
  type        = "string"
  description = "real name for irc bot."
}

variable "irc_server" {
  type        = "string"
  description = "server for irc bot."
}

variable "irc_port" {
  type        = "string"
  description = "port for irc bot."
}

variable "irc_password" {
  type        = "string"
  description = "password for irc bot."
}

variable "github_integration_id" {
  type        = "string"
  description = "taskcluster-github app integration id."
}

variable "github_oauth_token" {
  type        = "string"
  description = "taskcluster-github app oauth token."
}

variable "github_private_pem" {
  type        = "string"
  description = "taskcluster-github private pem."
}

variable "github_webhook_secret" {
  type        = "string"
  description = "taskcluster-github webhook secret."
}

variable "audit_log_stream" {
  type        = "string"
  description = "kinesis stream for audit logs."
}
