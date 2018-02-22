#!/usr/bin/env bash

issuer=${JWT_ISSUER:-"https://auth.mozilla.auth0.com/"}
uri=${JWKS_URI:-"https://auth.mozilla.auth0.com/.well-known/jwks.json"}

JWT_ISSUER=${issuer} JWKS_URI=${uri} neutrino start
