package whclient

import (
	"errors"
)

var (
	// ErrRetryTimedOut is returned when Reconnect() time exceeds MaxElapsedTime
	ErrRetryTimedOut = errors.New("retry timed out")
)
