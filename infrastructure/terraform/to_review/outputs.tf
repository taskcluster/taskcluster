output "root_access_token" {
  sensitive = true
  value     = "${random_string.auth_root_access_token.result}"
}

output "websocktunnel_secret" {
  sensitive = true
  value     = "${random_string.auth_websocktunnel_secret.result}"
}
