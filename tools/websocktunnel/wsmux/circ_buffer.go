package wsmux

import (
	"github.com/taskcluster/websocktunnel/util"
)

type buffer struct {
	buf   []byte
	start int  // start: points to first byte containing data
	end   int  // end: points to last byte containing data + 1
	cap   int  // capacity
	empty bool // required : s == e can be because buffer is empty or buffer is full
}

func newBuffer(capacity int) *buffer {
	return &buffer{
		buf:   make([]byte, capacity),
		start: 0,
		end:   0,
		cap:   capacity,
		empty: true,
	}
}

// Len returns length of buffer
func (b *buffer) Len() int {
	if b.empty {
		return 0
	}
	if b.start < b.end {
		return b.end - b.start
	}
	return b.cap + b.end - b.start
}

// Read from buffer
func (b *buffer) Read(buf []byte) (int, error) {
	// base case when buffer is empty
	if b.empty {
		return 0, nil
	}

	c := util.Min(len(buf), b.Len())
	m := 0

	if b.start < b.end {
		m = copy(buf, b.buf[b.start:b.start+c])
	} else {
		m = copy(buf, b.buf[b.start:])
		if m < c {
			m += copy(buf[m:], b.buf[:b.end])
		}
	}

	b.start = (b.start + m) % b.cap
	b.empty = b.start == b.end

	return m, nil
}

// Write to buffer
func (b *buffer) Write(buf []byte) (int, error) {
	// we have more bytes than we can write then error
	if len(buf) > b.spare() {
		return 0, ErrNoCapacity
	}

	m := copy(b.buf[b.end:], buf)
	if m < len(buf) {
		_ = copy(b.buf, buf[m:])
	}
	b.end += len(buf)
	b.end %= b.cap
	b.empty = false
	return len(buf), nil
}

// utility
func (b *buffer) spare() int {
	return b.cap - b.Len()
}
