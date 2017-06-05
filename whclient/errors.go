package whclient

import (
	"errors"
)

var (
	ErrRetryTimedOut = errors.New("retry timed out")
)
