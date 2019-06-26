package protocol

type MessageCallback func(msg Message)

type Protocol struct {
	// transport over which this protocol is running
	transport Transport

	// current set of agreed capabilities
	Capabilities *Capabilities

	// callbacks per message type
	callbacks map[string][]MessageCallback
}

func NewProtocol(transport Transport) *Protocol {
	return &Protocol{
		transport:    transport,
		Capabilities: EmptyCapabilities(),
		callbacks:    make(map[string][]MessageCallback),
	}
}

// Register a callback for the given message type.  This must occur before the
// protocol is started.
func (prot *Protocol) Register(messageType string, callback MessageCallback) {
	callbacks := prot.callbacks[messageType]
	callbacks = append(callbacks, callback)
	prot.callbacks[messageType] = callbacks
}

// convert an anymous interface into a list of strings; useful for parsing lists
// out of messages
func listOfStrings(val interface{}) []string {
	aslist := val.([]interface{})
	rv := make([]string, 0, len(aslist))
	for _, elt := range aslist {
		rv = append(rv, elt.(string))
	}
	return rv
}

// Start the protocol and initiate the hello/welcome transaction.
func (prot *Protocol) Start(asWorker bool) {
	if asWorker {
		prot.Register("welcome", func(msg Message) {
			caps := FullCapabilities()
			otherCaps := FromCapabilitiesList(listOfStrings(msg.Properties["capabilities"]))
			caps.LimitTo(otherCaps)
			prot.Capabilities = caps

			prot.Send(Message{
				Type: "hello",
				Properties: map[string]interface{}{
					"capabilities": prot.Capabilities.List(),
				},
			})
		})
	} else {
		prot.Register("hello", func(msg Message) {
			prot.Capabilities = FromCapabilitiesList(listOfStrings(msg.Properties["capabilities"]))
		})

		fullCaps := FullCapabilities()
		prot.Send(Message{
			Type: "welcome",
			Properties: map[string]interface{}{
				"capabilities": fullCaps.List(),
			},
		})
	}
	go prot.recvLoop()
}

// Check if a capability is supported.  Note that the initial set
// of capabilities is empty, so calling this before the hello/welcome
// transaction has been completed will always return false.
func (prot *Protocol) Capable(c string) bool {
	return prot.Capabilities.Has(c)
}

func (prot *Protocol) Send(msg Message) {
	prot.transport.Send(msg)
}

func (prot *Protocol) recvLoop() {
	for {
		msg, ok := prot.transport.Recv()
		if !ok {
			return
		}
		callbacks := prot.callbacks[msg.Type]
		for _, cb := range callbacks {
			cb(msg)
		}
	}
}
