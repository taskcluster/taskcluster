package workerproto

import (
	"log"
	"sync"
)

type MessageCallback func(msg Message)

type Protocol struct {
	// transport over which this protocol is running
	transport Transport

	// local and remote capabilities
	localCapabilities  *capabilities
	remoteCapabilities *capabilities

	// callbacks per message type
	callbacks map[string][]MessageCallback

	// tracking for whether Start has been called yet
	started      bool
	startedMutex sync.Mutex

	// tracking for whether this protocol is intialized
	initialized     bool
	initializedCond sync.Cond

	// tracking for EOF from the read side of the transport
	eof     bool
	eofCond sync.Cond
}

func NewProtocol(transport Transport) *Protocol {
	return &Protocol{
		transport:          transport,
		localCapabilities:  EmptyCapabilities(),
		remoteCapabilities: EmptyCapabilities(),
		callbacks:          make(map[string][]MessageCallback),
		initialized:        false,
		initializedCond: sync.Cond{
			L: &sync.Mutex{},
		},
		eofCond: sync.Cond{
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
			prot.remoteCapabilities = FromCapabilitiesList(listOfStrings(msg.Properties["capabilities"]))
			prot.Send(Message{
				Type: "hello",
				Properties: map[string]interface{}{
					"capabilities": prot.localCapabilities.List(),
				},
			})
			prot.SetInitialized()
		})
	} else {
		prot.Register("hello", func(msg Message) {
			prot.remoteCapabilities = FromCapabilitiesList(listOfStrings(msg.Properties["capabilities"]))
			prot.SetInitialized()
		})

		// send a welcome message, but don't wait for it to complete
		go func() {
			prot.Send(Message{
				Type: "welcome",
				Properties: map[string]interface{}{
					"capabilities": prot.localCapabilities.List(),
				},
			})
		}()
	}
	prot.startedMutex.Lock()
	prot.started = true
	prot.startedMutex.Unlock()
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

// Add the given capability to the local capabilities
func (prot *Protocol) AddCapability(c string) {
	prot.startedMutex.Lock()
	defer prot.startedMutex.Unlock()
	if prot.started {
		panic("Cannot AddCapability after protocol is started")
	}
	prot.localCapabilities.Add(c)
}

// Check if a capability is supported by both ends of the protocol, after
// waiting for initialization.
func (prot *Protocol) Capable(c string) bool {
	prot.WaitUntilInitialized()
	return prot.localCapabilities.Has(c) && prot.remoteCapabilities.Has(c)
}

// Wait until all message have been read from the transport.
func (prot *Protocol) WaitForEOF() {
	prot.eofCond.L.Lock()
	defer prot.eofCond.L.Unlock()
	for !prot.eof {
		prot.eofCond.Wait()
	}
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
			prot.eofCond.L.Lock()
			prot.eof = true
			prot.eofCond.Broadcast()
			prot.eofCond.L.Unlock()
			return
		}
		callbacks, ok := prot.callbacks[msg.Type]
		if ok {
			for _, cb := range callbacks {
				cb(msg)
			}
		} else {
			log.Printf("No callback registered for message %s\n", msg.Type)
		}
	}
}
