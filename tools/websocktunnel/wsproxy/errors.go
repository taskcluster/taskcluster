package wsproxy

import (
	"errors"
)

var (
	// ErrUnexpectedSigningMethod is returned when the signing method used by the given JWT is not HMAC.
	ErrUnexpectedSigningMethod = errors.New("unexpected signing method on jwt")

	// ErrTokenNotValid is returned when the jwt is not valid.
	ErrTokenNotValid = errors.New("token not valid")

	// ErrAuthFailed is returned when jwt verification fails.
	ErrAuthFailed = errors.New("auth failed")

	// ErrMissingSecret is returned when the proxy does not load both required secrets.
	ErrMissingSecret = errors.New("both secrets must be loaded")
)
