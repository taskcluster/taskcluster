package readwriteseeker

import (
	"io"
	"testing"
)

func TestWrite(t *testing.T) {
	readWriteSeeker := &ReadWriteSeeker{}
	var ws io.WriteSeeker = readWriteSeeker

	ws.Write([]byte("hello"))
	if string(readWriteSeeker.buf) != "hello" {
		t.Fail()
	}

	ws.Write([]byte(" world"))
	if string(readWriteSeeker.buf) != "hello world" {
		t.Fail()
	}

}

func TestSeek(t *testing.T) {
	readWriteSeeker := &ReadWriteSeeker{}
	var ws io.WriteSeeker = readWriteSeeker

	ws.Write([]byte("hello"))
	if string(readWriteSeeker.buf) != "hello" {
		t.Fail()
	}

	ws.Write([]byte(" world"))
	if string(readWriteSeeker.buf) != "hello world" {
		t.Fail()
	}

	ws.Seek(-2, io.SeekEnd)
	ws.Write([]byte("k!"))
	if string(readWriteSeeker.buf) != "hello work!" {
		t.Fail()
	}

	ws.Seek(6, io.SeekStart)
	ws.Write([]byte("gopher"))
	if string(readWriteSeeker.buf) != "hello gopher" {
		t.Fail()
	}
}
