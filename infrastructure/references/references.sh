#!/bin/sh

set -e

# relativize the schemas and references to a writable directory
cd /app
node infrastructure/references/relativize.js generated/references.json /tmp/references

# start nginx with standalone config
exec nginx -c /app/infrastructure/references/nginx.conf -g 'daemon off;'
