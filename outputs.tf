output "installer_config" {
  value = {
    auth_secret_name = "${module.auth_secrets.secret_name}"
    auth_secret_keys = "${module.auth_secrets.env_var_keys}"

    queue_secret_name = "${module.queue_secrets.secret_name}"
    queue_secret_keys = "${module.queue_secrets.env_var_keys}"
  }
}

output "auth_root_access_token" {
  sensitive = true
  value     = "${random_string.auth_root_access_token.result}"
}
