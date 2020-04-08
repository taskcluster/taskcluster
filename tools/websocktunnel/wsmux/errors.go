package wsmux

import (
	"errors"
)

var (

	// ErrAcceptTimeout is returned when the Accept operation times out
	ErrAcceptTimeout = errors.New("accept timed out")

	// ErrBrokenPipe is returned when data cannot be written to or read from a stream
	ErrBrokenPipe = errors.New("broken pipe")

	// ErrWriteTimeout if the write operation on a stream times out
	ErrWriteTimeout = errors.New("wsmux: write operation timed out")

	// ErrReadTimeout if the read operation on a stream times out
	ErrReadTimeout = errors.New("wsmux: read operation timed out")

	// ErrNoCapacity is returns if the read buffer is full and a session attempts to load
	// more data into the buffer
	ErrNoCapacity = errors.New("buffer does not have capacity to accomodate extra data")

	// ErrDuplicateStream is returned when a duplicate stream is found
	ErrDuplicateStream = errors.New("duplicate stream")

	//ErrSessionClosed is returned when a closed session tries to create a new stream
	ErrSessionClosed = errors.New("session closed")

	//ErrInvalidDeadline is returned when the time is before the current time
	ErrInvalidDeadline = errors.New("invalid deadline")

	//ErrKeepAliveExpired is returned when the keep alive timer expired
	ErrKeepAliveExpired = errors.New("keep alive timer expired")

	// ErrMalformedHeader indicate a websocket frame header was invalid.
	ErrMalformedHeader = errors.New("malformed header")

	// ErrTooManySyns indicates too many un-accepted new incoming streams
	ErrTooManySyns = errors.New("too many un-accepted new incoming streams")
)
