package dockerExecWS

const (
	// streamStdin is the code for a message containing stdin data.
	streamStdin uint8 = 0
	// streamStdout is the code for a message containing stdout data.
	streamStdout uint8 = 1
	// streamStderr is the code for a message containing stderr data.
	streamStderr uint8 = 2

	// messageTypeResize is the code for a message containing windows size information.
	messageTypeResize uint8 = 50

	// messageTypeResume is the code for a resume data-flow message.
	messageTypeResume uint8 = 100
	// messageTypePause is the code for a pause data-flow message.
	messageTypePause uint8 = 101
	// messageTypeEnd is the code for an end data-flow message.
	messageTypeEnd uint8 = 102

	// messageTypeStopped is the code for when the remote process terminated.
	messageTypeStopped uint8 = 200
	// messageTypeShutdown is the code for a server shutdown message.
	messageTypeShutdown uint8 = 201
	// messageTypeError is the code for a server error message.
	messageTypeError uint8 = 202
)
