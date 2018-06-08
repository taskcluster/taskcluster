output "password" {
  value = "${random_string.rabbitmq_pass.result}"
}
