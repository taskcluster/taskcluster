package wsmux

import (
	"bytes"
	"encoding/binary"
	"strconv"
)

const (
	// Indicates data frame
	msgDAT byte = 0
	// Initiates new stream
	msgSYN byte = 1
	// Sent when data is received along with spare buffer capacity
	msgACK byte = 2
	// Used to close a stream
	msgFIN byte = 3
	// If this byte arrives in the header of any stream, it indicates that the remote has closed and will
	// not accept further connections
	msgCLS byte = 4

	maxBufferCapacity int = 0xffff
)

// SPEC |STREAM ID (32 bits)|MSG (8 bits)|DATA|

// header length = 4 + 1 = 5 bytes

type header []byte

func (h header) id() uint32 {
	return binary.LittleEndian.Uint32(h[1:])
}

func (h header) msg() byte {
	return h[0]
}

func newHeader(msg byte, id uint32) header {
	h := make([]byte, 5)
	h[0] = msg
	binary.LittleEndian.PutUint32(h[1:], id)
	return h
}

type frame struct {
	id      uint32
	msg     byte
	payload []byte
}

func (f frame) Write() []byte {
	h := []byte(newHeader(f.msg, f.id))
	h = append(h, f.payload...)
	return h
}

func (f frame) String() string {
	str := strconv.Itoa(int(f.id))
	str += " "
	switch f.msg {
	case msgDAT:
		str += "DAT"
	case msgSYN:
		str += "SYN"
	case msgACK:
		str += "ACK"
	case msgFIN:
		str += "FIN"
	case msgCLS:
		str += "CLS"
	}
	str += " "
	str += bytes.NewBuffer(f.payload).String()
	return str
}

func newDataFrame(id uint32, buf []byte) frame {
	b := make([]byte, len(buf))
	_ = copy(b, buf)
	frame := frame{id: id, msg: msgDAT, payload: b}
	return frame
}

func newSynFrame(id uint32) frame {
	frame := frame{id: id, msg: msgSYN, payload: nil}
	return frame
}

func newAckFrame(id uint32, cap uint32) frame {
	frame := frame{id: id, msg: msgACK}
	frame.payload = make([]byte, 4)
	binary.LittleEndian.PutUint32(frame.payload, cap)
	return frame
}

func newFinFrame(id uint32) frame {
	return frame{id: id, msg: msgFIN, payload: nil}
}

func newClsFrame(id uint32) frame {
	return frame{id: id, msg: msgCLS}
}
