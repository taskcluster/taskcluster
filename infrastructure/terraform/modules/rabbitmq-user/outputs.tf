output "username" {
  value = "${rabbitmq_user.user.name}"
}

output "password" {
  value = "${random_string.rabbitmq_pass.result}"
}
