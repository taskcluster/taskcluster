package wsmux

import (
	"testing"
)

func TestCircularBuffer(t *testing.T) {
	b := newBuffer(8)

	// write
	buf := []byte{1, 2, 3, 4, 5}
	n, err := b.Write(buf)
	if err != nil {
		t.Fatal(err)
	}
	if n != 5 && b.end != 5 {
		t.Logf("n: %d s: %d e: %d", n, b.start, b.end)
		t.Logf("b.buf: %v", b.buf)
		t.Fatalf("incorrect number of bytes written")
	}

	//read
	buf = []byte{0, 0, 0}
	n, _ = b.Read(buf)
	if n != 3 {
		t.Logf("buffer length: %d", b.Len())
		t.Fatalf("incorrect number of bytes read: %d", n)
	}

	if b.Len() != 2 {
		t.Logf("n: %d s: %d e: %d", n, b.start, b.end)
		t.Logf("b.buf: %v", b.buf)
		t.Fatal("incorrect buffer length")
	}

	// write circular
	buf = []byte{1, 2, 3, 4, 5}
	_, err = b.Write(buf)
	if err != nil {
		t.Fatal(err)
	}
	if b.Len() != 7 {
		t.Logf("n: %d s: %d e: %d", n, b.start, b.end)
		t.Logf("b.buf: %v", b.buf)
		t.Fatal("incorrect buffer length")
	}

	//read circular
	buf = make([]byte, 7)
	n, _ = b.Read(buf)
	if n != 7 {
		t.Fatal("incorrect number of bytes read")
	}
	if b.Len() != 0 {
		t.Logf("n: %d s: %d e: %d", n, b.start, b.end)
		t.Logf("b.buf: %v", b.buf)
		t.Fatal("buffer should be empty")
	}

	//fill buffer
	buf = []byte{1, 2, 3, 4, 5, 6, 7, 8}
	n, err = b.Write(buf)
	if err != nil {
		t.Fatal(err)
	}
	if n != 8 {
		t.Fatal("incorrect number of bytes written")
	}

	if b.Len() != 8 {
		t.Fatal("buffer should be full")
	}
}
