#! /bin/sh

set -e

# relativize the schemas and references
cd /app
node infrastructure/references/relativize generated/references.json /references

# start nginx
cp infrastructure/references/nginx.conf /etc/nginx/conf.d/default.conf
exec nginx -g 'daemon off;'
