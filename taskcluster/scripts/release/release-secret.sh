#!/usr/bin/env bash
# Print one field of the release secret (the staging one when STAGING=1), read
# through taskcluster-proxy. Callers capture the output; never echo it.
set -euo pipefail

field="${1:?usage: release-secret.sh FIELD}"
: "${TASKCLUSTER_PROXY_URL:?}"

name=project/taskcluster/release
if [ "${STAGING:-}" = 1 ]; then
  name=project/taskcluster/staging-release
fi
secret="$(curl -fsS --retry 3 "$TASKCLUSTER_PROXY_URL/api/secrets/v1/secret/$name")"
python3 -c '
import json, sys
field = sys.argv[1]
value = json.load(sys.stdin).get("secret", {}).get(field)
if not isinstance(value, str) or not value:
    sys.exit("release-secret: field " + field + " is missing, empty, or not a string")
print(value)
' "$field" <<<"$secret"
