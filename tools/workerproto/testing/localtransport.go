package testing

import (
	"encoding/json"

	"github.com/taskcluster/taskcluster/v50/tools/workerproto"
)

// LocalTransport is a transport for which both sides are in the same process.
type LocalTransport struct {
	opposite *LocalTransport
	input    chan workerproto.Message
}

// Create a linked pair of LocalTransport instances.  This is similar to the POSIX pipe()
// method.
func NewLocalTransportPair() (*LocalTransport, *LocalTransport) {
	left := &LocalTransport{input: make(chan workerproto.Message, 10)}
	right := &LocalTransport{input: make(chan workerproto.Message, 10)}
	left.opposite = right
	right.opposite = left

	return left, right
}

func (transp *LocalTransport) Close() {
	if transp.opposite != nil {
		close(transp.opposite.input)
		transp.opposite = nil
	}
}

// workerproto.Transport interface

func (transp *LocalTransport) Send(msg workerproto.Message) {
	if transp.opposite == nil {
		panic("transport already closed")
	}

	// Run the message through JSON and back, just to check
	j, err := json.Marshal(&msg)
	if err != nil {
		panic(err)
	}
	var msg2 workerproto.Message
	err = json.Unmarshal(j, &msg2)
	if err != nil {
		panic(err)
	}

	transp.opposite.input <- msg2
}

func (transp *LocalTransport) Recv() (workerproto.Message, bool) {
	msg, ok := <-transp.input
	return msg, ok
}
