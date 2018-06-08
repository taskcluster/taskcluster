# TODO: Combine root_url/debug into a list that can be passed in

variable "root_url" {
  type        = "string"
  description = "Taskcluster rootUrl."
}

variable "docker_image" {
  type        = "string"
  description = "The image of this service to run."
}

variable "project_name" {
  type        = "string"
  description = "The name of the service (with taskcluster-)."
}

variable "service_name" {
  type        = "string"
  description = "The name of the service."
}

variable "secret_keys" {
  type        = "list"
  description = "A set of environment variables to set via kubernetes secrets."
}

variable "secret_name" {
  type        = "string"
  description = "The kubernetes secret to pull the variables from."
}
