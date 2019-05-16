#!/bin/bash
set -u

# will not work for > 65
function genpw () {
    openssl rand -base64 46 | cut -c1-"$1"
}

genpw 65 > purge_cache_access_token