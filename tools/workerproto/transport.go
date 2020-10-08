package workerproto

// Transport is a means of sending and receiving messages.
type Transport interface {
	// Send a message to the worker
	Send(Message)

	// Receive a message from the worker, blocking until one is availble
	Recv() (Message, bool)
}
