variable "project_name" {
  type        = "string"
  description = "The name of the service to store secrets for."
}

variable "secrets" {
  type        = "map"
  default     = {}
  description = "A map of secrets to make available to the service."
}

variable "secret_files" {
  type        = "map"
  default     = {}
  description = "A map of secrets to make available to the service as files. Will _not_ be included in the set of env_var_keys that are exported."
}

variable "disabled_services" {
  type        = "list"
  description = "list of disabled services."
  default     = []
}
