variable "prefix" {
  type        = "string"
  description = "The name prefix for the username."
}

variable "project_name" {
  type        = "string"
  description = "The name of the service to create rabbitmq user for."
}

variable "rabbitmq_vhost" {
  type        = "string"
  description = "The vhost of the rabbitmq instance."
}
