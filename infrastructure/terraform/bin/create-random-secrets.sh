#!/bin/bash
set -u

# for generating a random password of a given length
# will not work for > 130
function genpw () {
    openssl rand -base64 94 |  tr -d '\n' | cut -c1-"$1"
}

# for generating a random number bytes of a given length after being decoded
function genkey() {
    openssl rand -base64 $1
}

genkey 32 > auth_azure_crypto_key
genkey 32 > hooks_azure_crypto_key
genkey 32 > secrets_azure_crypto_key

genpw 40 > auth_azure_signing_key
genpw 40 > hooks_azure_signing_key
genpw 40 > secrets_azure_signing_key
genpw 65 > auth_root_access_token
genpw 65 > built_in_workers_access_token
genpw 65 > github_access_token
genpw 65 > hooks_access_token
genpw 65 > index_access_token
genpw 65 > notify_access_token
genpw 65 > purge_cache_access_token
genpw 65 > queue_access_token
genpw 65 > secrets_access_token
genpw 65 > web_server_access_token
genpw 65 > worker_manager_access_token
genpw 66 > auth_websocktunnel_secret
