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

func TestBytes(t *testing.T) {
	rws := &ReadWriteSeeker{}
	_, _ = rws.Write([]byte("hello world"))
	_, _ = rws.Seek(0, io.SeekStart)
	_, _ = rws.Write([]byte("jello"))
	if got := string(rws.Bytes()); got != "jello world" {
		t.Errorf("Bytes() = %q, want %q", got, "jello world")
	}
}

func TestWritePastEnd(t *testing.T) {
	rws := &ReadWriteSeeker{}
	_, _ = rws.Write([]byte("ab"))
	_, _ = rws.Seek(2, io.SeekEnd)
	_, _ = rws.Write([]byte("cd"))
	if got := string(rws.Bytes()); got != "ab\x00\x00cd" {
		t.Errorf("Bytes() = %q, want %q", got, "ab\x00\x00cd")
	}
}

// Writing a large object in small chunks, as io.Copy does, must grow the
// buffer geometrically rather than reallocating on every few writes.
func TestWriteGrowsGeometrically(t *testing.T) {
	chunk := make([]byte, 32<<10)
	allocs := testing.AllocsPerRun(1, func() {
		rws := &ReadWriteSeeker{}
		for range (64 << 20) / len(chunk) {
			_, _ = rws.Write(chunk)
		}
	})
	if allocs > 100 {
		t.Errorf("writing 64MiB in 32KiB chunks took %v allocations, want <= 100", allocs)
	}
}
