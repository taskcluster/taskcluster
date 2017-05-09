package wsmux

import (
	"fmt"
)

var (
	// ErrRemoteClosed is returned when the remote session sends a CLS frame. No new connections
	// will be accepted by the remote connection
	ErrRemoteClosed = fmt.Errorf("remote session is no longer accepting connections")

	// ErrAcceptTimeout is returned when the Accept operation times out
	ErrAcceptTimeout = fmt.Errorf("accept timed out")

	// ErrBrokenPipe is returned when data cannot be written to or read from a stream
	ErrBrokenPipe = fmt.Errorf("broken pipe")

	// ErrWriteTimeout if the write operation on a stream times out
	ErrWriteTimeout = fmt.Errorf("wsmux: write operation timed out")

	// ErrReadTimeout if the read operation on a stream times out
	ErrReadTimeout = fmt.Errorf("wsmux: read operation timed out")

	// ErrBufferFull is returns if the read buffer is full and a session attempts to load
	// more data into the buffer
	ErrBufferFull = fmt.Errorf("read buffer is full")

	// ErrDuplicateStream is returned when a duplicate stream is found
	ErrDuplicateStream = fmt.Errorf("duplicate stream")

	//ErrSessionClosed is returned when a closed session tries to create a new stream
	ErrSessionClosed = fmt.Errorf("session closed")
)
