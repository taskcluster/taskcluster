variable "disabled_services" {
  type        = "list"
  default     = []
  description = "List of services to disable i.e. [\"taskcluster-notify\"]"
}

variable "irc_name" {
  type        = "string"
  description = "username for irc bot."
}

variable "irc_nick" {
  type        = "string"
  description = "nick for irc bot."
}

variable "irc_port" {
  type        = "string"
  description = "port for irc bot."
}

variable "irc_password" {
  type        = "string"
  description = "password for irc bot."
}

variable "irc_real_name" {
  type        = "string"
  description = "real name for irc bot."
}

variable "irc_server" {
  type        = "string"
  description = "server for irc bot."
}

variable "root_url" {
  type        = "string"
  description = "Taskcluster rootUrl"
}

variable "root_url_tls_secret" {
  type        = "string"
  description = "Name of the secret, in the same namespace as the Ingress controller, containing the TLS certificate for Taskcluster rootUrl"
}
