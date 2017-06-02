package wsmux

import (
	"github.com/taskcluster/webhooktunnel/util"
)

type buffer struct {
	buf   []byte
	s     int  // start: points to first byte containing data
	e     int  // end: points to last byte containing data + 1
	c     int  // capacity
	empty bool // required : s == e can be because buffer is empty or buffer is full
}

func newBuffer(capacity int) *buffer {
	return &buffer{
		buf:   make([]byte, capacity),
		s:     0,
		e:     0,
		c:     capacity,
		empty: true,
	}
}

// Len returns length of buffer
func (b *buffer) Len() int {
	if b.empty {
		return 0
	}
	if b.s < b.e {
		return b.e - b.s
	}
	return b.c + b.e - b.s
}

// Read from buffer
func (b *buffer) Read(buf []byte) (int, error) {
	// base case when buffer is empty
	if b.empty {
		return 0, nil
	}

	c := util.Min(len(buf), b.Len())
	m := 0

	if b.s < b.e {
		m = copy(buf, b.buf[b.s:b.s+c])
	} else {
		m = copy(buf, b.buf[b.s:])
		if m < c {
			m += copy(buf[m:], b.buf[:b.e])
		}
	}

	b.s = (b.s + m) % b.c
	b.empty = b.s == b.e

	return m, nil
}

// Write to buffer
func (b *buffer) Write(buf []byte) (int, error) {
	// we have more bytes than we can write then error
	if len(buf) > b.spare() {
		return 0, ErrNoCapacity
	}

	m := copy(b.buf[b.e:], buf)
	if m < len(buf) {
		m = copy(b.buf, buf[m:])
	}
	b.e += len(buf)
	b.e %= b.c
	b.empty = false
	return len(buf), nil
}

// utility
func (b *buffer) spare() int {
	return b.c - b.Len()
}
