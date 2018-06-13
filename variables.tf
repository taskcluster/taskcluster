variable "bucket_prefix" {
  type        = "string"
  description = "The prefix of all s3 buckets needed for a taskcluster cluster to function."
}

variable "azure_resource_group_name" {
  type        = "string"
  description = "Name of azure storage resource group"
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

variable "tls_crt" {
  type        = "string"
  description = "Taskcluster tls certificate"
}

variable "tls_key" {
  type        = "string"
  description = "Taskcluster tls private key"
}

variable "rabbitmq_hostname" {
  type        = "string"
  description = "rabbitmq hostname"
}

variable "rabbitmq_vhost" {
  type        = "string"
  description = "rabbitmq hostname"
}
