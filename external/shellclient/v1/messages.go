package v1

const (
	// StreamStdin is the code for a message containing stdin data.
	StreamStdin uint8 = 0
	// StreamStdout is the code for a message containing stdout data.
	StreamStdout uint8 = 1
	// StreamStderr is the code for a message containing stderr data.
	StreamStderr uint8 = 2

	// MessageTypeResize is the code for a message containing windows size information.
	MessageTypeResize uint8 = 50

	// MessageTypeResume is the code for a resume data-flow message.
	MessageTypeResume uint8 = 100
	// MessageTypePause is the code for a pause data-flow message.
	MessageTypePause uint8 = 101
	// MessageTypeEnd is the code for an end data-flow message.
	MessageTypeEnd uint8 = 102

	// MessageTypeStopped is the code for when the remote process terminated.
	MessageTypeStopped uint8 = 200
	// MessageTypeShutdown is the code for a server shutdown message.
	MessageTypeShutdown uint8 = 201
	// MessageTypeError is the code for a server error message.
	MessageTypeError uint8 = 202
)
