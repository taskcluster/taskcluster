variable "name" {
  type        = "string"
  description = "The name of the service that requires credentials."
}

variable "policy" {
  type        = "string"
  description = "The policy to attach to the service's user."
}
