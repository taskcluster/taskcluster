package protocol

import "sync"

type MessageCallback func(msg Message)

type Protocol struct {
	// transport over which this protocol is running
	transport Transport

	// current set of agreed capabilities (but call WaitUntilInitialized first
	// to avoid finding the empty set at startup)
	Capabilities *Capabilities

	// callbacks per message type
	callbacks map[string][]MessageCallback

	// tracking for whether this protocol is intialized
	initialized     bool
	initializedCond sync.Cond
}

func NewProtocol(transport Transport) *Protocol {
	return &Protocol{
		transport:    transport,
		Capabilities: EmptyCapabilities(),
		callbacks:    make(map[string][]MessageCallback),
		initialized:  false,
		initializedCond: sync.Cond{
			L: &sync.Mutex{},
		},
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
			prot.SetInitialized()
		})
	} else {
		prot.Register("hello", func(msg Message) {
			prot.Capabilities = FromCapabilitiesList(listOfStrings(msg.Properties["capabilities"]))
			prot.SetInitialized()
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

// Set this protocol as initialized.  Ordinarily this happens automatically, but in cases
// where the worker does not support the protocol, this method can be used to indicate that
// the protocol is "initialized" with no capabilities.
func (prot *Protocol) SetInitialized() {
	// announce that we are now initialized
	prot.initializedCond.L.Lock()
	defer prot.initializedCond.L.Unlock()
	prot.initialized = true
	prot.initializedCond.Broadcast()
}

// Wait until this protocol is initialized.
func (prot *Protocol) WaitUntilInitialized() {
	prot.initializedCond.L.Lock()
	defer prot.initializedCond.L.Unlock()
	for !prot.initialized {
		prot.initializedCond.Wait()
	}
}

// Check if a capability is supported, after waiting for initialization.
func (prot *Protocol) Capable(c string) bool {
	prot.WaitUntilInitialized()
	return prot.Capabilities.Has(c)
}

// Send a message.  This happens without waiting for initialization; as the
// caller should already have used prot.Capable to determine whether the
// message was supported.
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
