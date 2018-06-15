output "env_var_keys" {
  value = "${keys(var.secrets)}"
}

output "secret_name" {
  value = "${var.project_name}"
}

output "secrets_hash" {
  value = "${sha512(join("", k8s_manifest.secrets_resource.*.content))}"
}
