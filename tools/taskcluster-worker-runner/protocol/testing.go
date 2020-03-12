package protocol

import (
	"sync"
)

// FakeTransport implements Transport and records sent messages.  It is used
// for testing.
type FakeTransport struct {
	mux          sync.Mutex
	messages     []Message
	fakeMessages chan Message
}

func NewFakeTransport() *FakeTransport {
	return &FakeTransport{
		messages:     []Message{},
		fakeMessages: make(chan Message, 10),
	}
}

func (transp *FakeTransport) Send(msg Message) {
	transp.mux.Lock()
	defer transp.mux.Unlock()
	transp.messages = append(transp.messages, msg)
}

func (transp *FakeTransport) Recv() (Message, bool) {
	msg, ok := <-transp.fakeMessages
	return msg, ok
}

// Queue a message to be received over this transport
func (transp *FakeTransport) InjectMessage(msg Message) {
	transp.fakeMessages <- msg
}

// Close this transport, indicating no more messages will be received
func (transp *FakeTransport) Close() {
	close(transp.fakeMessages)
}

// Get the messages that have been sent over this transport
func (transp *FakeTransport) Messages() []Message {
	transp.mux.Lock()
	defer transp.mux.Unlock()
	// make a copy of the messages that won't be modified concurrently
	rv := make([]Message, len(transp.messages))
	copy(rv, transp.messages)
	return rv
}

// Clear the list of received messages
func (transp *FakeTransport) ClearMessages() {
	transp.mux.Lock()
	defer transp.mux.Unlock()
	transp.messages = []Message{}
}

// Generate a fake protocol that is initialized has the given capabilities.  Used
// for testing.
func FakeProtocolWithCapabilities(capabilities ...string) (transp *FakeTransport, proto *Protocol) {
	transp = NewFakeTransport()

	capabilitiesIface := make([]interface{}, 0)
	for _, capability := range capabilities {
		capabilitiesIface = append(capabilitiesIface, capability)
	}

	transp.InjectMessage(Message{
		Type: "hello",
		Properties: map[string]interface{}{
			"capabilities": capabilitiesIface,
		},
	})

	proto = NewProtocol(transp)
	for _, capability := range capabilities {
		proto.AddCapability(capability)
	}

	proto.Start(false)
	proto.WaitUntilInitialized()

	transp.ClearMessages()

	return
}
