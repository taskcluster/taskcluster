package whproxy

import (
	"errors"
)

var (
	// ErrDuplicateWorker is returned when a request attempts to add a worker to the pool with an id
	// which is present in the pool
	ErrDuplicateWorker = errors.New("duplicate worker")

	// ErrUnexpectedSigningMethod is returned when the signing method used by the JWT is not HMAC
	ErrUnexpectedSigningMethod = errors.New("unexpected signing method on jwt")

	// ErrTokenNotValid is returned when the jwt is not valid
	ErrTokenNotValid = errors.New("token not valid")

	// ErrAuthFailed is returned when jwt parsing fails with an error
	ErrAuthFailed = errors.New("auth failed")
)
