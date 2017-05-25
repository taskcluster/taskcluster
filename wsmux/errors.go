package wsmux

import (
	"fmt"
)

var (

	// ErrAcceptTimeout is returned when the Accept operation times out
	ErrAcceptTimeout = fmt.Errorf("accept timed out")

	// ErrBrokenPipe is returned when data cannot be written to or read from a stream
	ErrBrokenPipe = fmt.Errorf("broken pipe")

	// ErrWriteTimeout if the write operation on a stream times out
	ErrWriteTimeout = fmt.Errorf("wsmux: write operation timed out")

	// ErrReadTimeout if the read operation on a stream times out
	ErrReadTimeout = fmt.Errorf("wsmux: read operation timed out")

	// ErrNoCapacity is returns if the read buffer is full and a session attempts to load
	// more data into the buffer
	ErrNoCapacity = fmt.Errorf("buffer does not have capacity to accomodate extra data")

	// ErrDuplicateStream is returned when a duplicate stream is found
	ErrDuplicateStream = fmt.Errorf("duplicate stream")

	//ErrSessionClosed is returned when a closed session tries to create a new stream
	ErrSessionClosed = fmt.Errorf("session closed")

	//ErrInvalidDeadline is returned when the time is before the current time
	ErrInvalidDeadline = fmt.Errorf("invalid deadline")

	//ErrKeepAliveExpired is returned when the keep alive timer expired
	ErrKeepAliveExpired = fmt.Errorf("keep alive timer expired")
)
