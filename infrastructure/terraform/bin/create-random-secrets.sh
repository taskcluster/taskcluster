#!/bin/bash
set -u

# will not work for > 65
function genpw () {
    openssl rand -base64 46 | cut -c1-"$1"
}

genpw 65 > purge_cache_access_token
genpw 65 > built_in_workers_access_token
genpw 65 > web_server_access_token
genpw 65 > worker_manager_access_token
genpw 65 > index_access_token
genpw 65 > github_access_token
genpw 65 > hooks_access_token
genpw 65 > notify_access_token
genpw 65 > secrets_access_token
genpw 32 > auth_azure_crypto_key
genpw 32 > secrets_azure_crypto_key
genpw 40 > auth_azure_signing_key
genpw 40 > secrets_azure_signing_key
