package readwriteseeker

import (
	"errors"
	"io"
)

// ReadWriteSeeker is an in-memory io.ReadWriteSeeker implementation
type ReadWriteSeeker struct {
	buf []byte
	pos int
}

// Write implements the io.Writer interface
func (rws *ReadWriteSeeker) Write(p []byte) (n int, err error) {
	minCap := rws.pos + len(p)
	if minCap > cap(rws.buf) { // Make sure buf has enough capacity:
		buf2 := make([]byte, len(rws.buf), minCap+len(p)) // add some extra
		copy(buf2, rws.buf)
		rws.buf = buf2
	}
	if minCap > len(rws.buf) {
		rws.buf = rws.buf[:minCap]
	}
	copy(rws.buf[rws.pos:], p)
	rws.pos += len(p)
	return len(p), nil
}

// Seek implements the io.Seeker interface
func (rws *ReadWriteSeeker) Seek(offset int64, whence int) (int64, error) {
	newPos, offs := 0, int(offset)
	switch whence {
	case io.SeekStart:
		newPos = offs
	case io.SeekCurrent:
		newPos = rws.pos + offs
	case io.SeekEnd:
		newPos = len(rws.buf) + offs
	}
	if newPos < 0 {
		return 0, errors.New("negative result pos")
	}
	rws.pos = newPos
	return int64(newPos), nil
}

// Close is a no-op that implements the io.Closer interface
func (rws *ReadWriteSeeker) Close() error {
	return nil
}

// Read implements the io.Reader interface
func (rws *ReadWriteSeeker) Read(b []byte) (n int, err error) {
	if rws.pos >= len(rws.buf) {
		return 0, io.EOF
	}
	n = copy(b, rws.buf[rws.pos:])
	rws.pos += n
	return
}
