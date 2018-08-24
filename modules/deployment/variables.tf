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

variable "secrets_hash" {
  type        = "string"
  description = "Used to know if the deployment needs to be updated"
}

variable "disabled_services" {
  type        = "list"
  description = "list of disabled services."
  default     = []
}

variable "readiness_path" {
  type        = "string"
  description = "Path on this service to probe for readiness (must return 200)"
}

variable "proc_name" {
  type        = "string"
  default     = false
  description = "The process in the Procfile to run."
}

variable "cpu" {
  type        = "string"
  description = "Amount of cpu to assign the process"
  default     = "50m"
}

variable "memory" {
  type        = "string"
  description = "Amount of memory to assign the process"
  default     = "100Mi"
}

variable "replicas" {
  type        = "string"
  description = "How many copies of this to run"
  default     = 1
}
