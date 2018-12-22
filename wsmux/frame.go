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

	// last message type
	msgMax byte = msgFIN
)

// header contains a frame header.  It contains an 8-bit message type (`msg`,
// one of the `msgXXX` constants) followed by a little-endian u32 stream ID.
// The data in a frame immediately follows the frame header.
type header []byte

const HEADER_SIZE = 5

// id returns the stream ID in a header.
func (h header) id() uint32 {
	return binary.LittleEndian.Uint32(h[1:])
}

// msg returns the message type in a header.
func (h header) msg() byte {
	return h[0]
}

// newHeader creates a new header.
func newHeader(msg byte, id uint32) header {
	h := make([]byte, HEADER_SIZE)
	h[0] = msg
	binary.LittleEndian.PutUint32(h[1:], id)
	return h
}

// frame defines a frame in the client-service communication protocol.  Frames
// are transmitted over a websocket, which delimits the frame boundaries (so,
// no need for a length field) and handles retransmissions and the like.
//
// A frame consists of a header and a payload, with format depending on the message
// type:
//
// * msgDAT: the payload is the binary data
// * msgSYN: no payload
// * msgACK: payload is a little-endian u32 indicating the number of bytes handled
//   on the remote end and thus no longer "in flight".
// * msgFIN: no payload
type frame struct {
	id      uint32
	msg     byte
	payload []byte
}

// serialize returns the bytes representing this frame.
func (f frame) serialize() []byte {
	h := []byte(newHeader(f.msg, f.id))
	h = append(h, f.payload...)
	return h
}

// deserializeFrame creates a frame from a byte array. The byte array is
// assumed to contain exactly one frame.
func deserializeFrame(data []byte) (*frame, error) {
	if len(data) < HEADER_SIZE {
		return nil, ErrMalformedHeader
	}

	hdr := header(data[:HEADER_SIZE])
	msg := hdr.msg()
	if msg > msgMax {
		return nil, ErrMalformedHeader
	}

	return &frame{
		id:      hdr.id(),
		msg:     msg,
		payload: data[HEADER_SIZE:],
	}, nil
}

// String returns a human-readable version of the frame.
//
// Note that if a msgDAT frame contains binary data, that will not be encoded
// and may cause issues if displayed directly.
func (f frame) String() string {
	str := strconv.Itoa(int(f.id))
	str += " "
	switch f.msg {
	case msgDAT:
		str += "DAT " + bytes.NewBuffer(f.payload).String()
	case msgSYN:
		str += "SYN"
	case msgACK:
		str += "ACK "
		str += strconv.Itoa(int(binary.LittleEndian.Uint32(f.payload)))
	case msgFIN:
		str += "FIN"
	}
	return str
}

// newDataFrame creates a new msgDAT frame containing the given payload.
func newDataFrame(id uint32, buf []byte) frame {
	b := make([]byte, len(buf))
	_ = copy(b, buf)
	frame := frame{id: id, msg: msgDAT, payload: b}
	return frame
}

// newSynFrame creates a new msgSYN frame.
func newSynFrame(id uint32) frame {
	frame := frame{id: id, msg: msgSYN, payload: nil}
	return frame
}

// newSynFrame creates a new msgACK frame containing the given capacity.
func newAckFrame(id uint32, cap uint32) frame {
	frame := frame{id: id, msg: msgACK}
	frame.payload = make([]byte, 4)
	binary.LittleEndian.PutUint32(frame.payload, cap)
	return frame
}

// newSynFrame creates a new msgFIN frame.
func newFinFrame(id uint32) frame {
	return frame{id: id, msg: msgFIN, payload: nil}
}
