package v1

const (
	// Steam messages
	StreamStdin  uint8 = 0
	StreamStdout uint8 = 1
	StreamStderr uint8 = 2

	// Special message (w/ payload)
	MessageTypeResize uint8 = 50

	// data-flow (no payload)
	MessageTypeResume uint8 = 100
	MessageTypePause  uint8 = 101
	MessageTypeEnd    uint8 = 102

	// Resolution (may have payload)
	MessageTypeStopped  uint8 = 200
	MessageTypeShutdown uint8 = 201
	MessageTypeError    uint8 = 202
)
