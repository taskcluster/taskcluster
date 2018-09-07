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

variable "job_name" {
  type        = "string"
  description = "The process in the Procfile to run."
}

variable "schedule" {
  type        = "string"
  description = "Crontab-esque schedule i.e. `*/1 * * * *`."
}

variable "deadline_seconds" {
  type        = "string"
  description = "How long to allow the job to run before termination in seconds."
}

variable "secret_keys" {
  type        = "list"
  description = "A set of environment variables to set via kubernetes secrets."
}

variable "secrets_hash" {
  type        = "string"
  description = "Used to know if the deployment needs to be updated"
}

variable "secret_name" {
  type        = "string"
  description = "The kubernetes secret to pull the variables from."
}

variable "volume_mounts" {
  type        = "list"
  default     = []
  description = "A set of fields from the secrets to mount as files."
}
