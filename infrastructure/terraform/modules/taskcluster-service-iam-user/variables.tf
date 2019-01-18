variable "prefix" {
  type        = "string"
  description = "Short prefix applied to all cloud resources needed for a taskcluster cluster to function. This should be different for each deployment sharing a cloud account."
}

variable "name" {
  type        = "string"
  description = "The name of the service that requires credentials."
}

variable "policy" {
  type        = "string"
  description = "The policy to attach to the service's user."
}
