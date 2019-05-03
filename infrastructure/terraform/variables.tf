variable "prefix" {
  type        = "string"
  description = "Short prefix applied to all cloud resources needed for a taskcluster cluster to function. This should be different for each deployment sharing a cloud account."
}

variable "azure_region" {
  type        = "string"
  description = "Region of azure storage"
}

variable "aws_region" {
  description = "The AWS region to deploy into (e.g. us-east-1)."
}