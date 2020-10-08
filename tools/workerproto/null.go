package workerproto

// NullTransport implements Transport without doing anything.  It's suitable for
// workers that do not implement the protocol
type NullTransport struct{}

func NewNullTransport() *NullTransport {
	return &NullTransport{}
}

func (transp *NullTransport) Send(msg Message) {
	// sent messages are lost..
}

func (transp *NullTransport) Recv() (Message, bool) {
	// immediately return EOF
	return Message{}, false
}
