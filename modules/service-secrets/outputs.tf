output "env_var_keys" {
  value = "${keys(var.secrets)}"
}

output "secret_name" {
  value = "${var.service_name}"
}
