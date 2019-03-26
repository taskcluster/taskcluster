# TODO: These should come from sops

resource "random_string" "auth_azure_signing_key" {
  length = 40
}

resource "random_string" "auth_azure_crypto_key" {
  length = 32
}

resource "random_string" "hooks_table_signing_key" {
  length = 40
}

resource "random_string" "hooks_table_crypto_key" {
  length = 32
}

resource "random_string" "secrets_azure_signing_key" {
  length = 40
}

resource "random_string" "secrets_azure_crypto_key" {
  length = 32
}
