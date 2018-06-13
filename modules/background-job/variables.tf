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

variable "secret_keys" {
  type        = "list"
  description = "A set of environment variables to set via kubernetes secrets."
}

variable "secret_name" {
  type        = "string"
  description = "The kubernetes secret to pull the variables from."
}
