package readwriteseeker

import (
	"io"
	"testing"
)

func TestWrite(t *testing.T) {
	readWriteSeeker := &ReadWriteSeeker{}
	var ws io.WriteSeeker = readWriteSeeker

	_, _ = ws.Write([]byte("hello"))
	if string(readWriteSeeker.buf) != "hello" {
		t.Fail()
	}

	_, _ = ws.Write([]byte(" world"))
	if string(readWriteSeeker.buf) != "hello world" {
		t.Fail()
	}

}

func TestSeek(t *testing.T) {
	readWriteSeeker := &ReadWriteSeeker{}
	var ws io.WriteSeeker = readWriteSeeker

	_, _ = ws.Write([]byte("hello"))
	if string(readWriteSeeker.buf) != "hello" {
		t.Fail()
	}

	_, _ = ws.Write([]byte(" world"))
	if string(readWriteSeeker.buf) != "hello world" {
		t.Fail()
	}

	_, _ = ws.Seek(-2, io.SeekEnd)
	_, _ = ws.Write([]byte("k!"))
	if string(readWriteSeeker.buf) != "hello work!" {
		t.Fail()
	}

	_, _ = ws.Seek(6, io.SeekStart)
	_, _ = ws.Write([]byte("gopher"))
	if string(readWriteSeeker.buf) != "hello gopher" {
		t.Fail()
	}
}
