package protocol

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
	// no messages are ever received
	select {}
}
