output "root_access_token" {
  sensitive = true
  value     = "${random_string.auth_root_access_token.result}"
}
