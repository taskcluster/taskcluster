package writer

import (
	"bytes"
	"fmt"
	"io"
	"os"
	"sync"
	"testing"
)

import . "github.com/visionmedia/go-debug"

// Test structure which implements `Read` interface but EOF is suppressed until
// ended = true.
type PassThrough struct {
	buffer *bytes.Buffer
	ended  bool
}

func NewPassThrough(b *bytes.Buffer) *PassThrough {
	return &PassThrough{
		buffer: b,
		ended:  false,
	}
}

func (p *PassThrough) Read(buf []byte) (n int, err error) {
	count, err := p.buffer.Read(buf)

	if err == io.EOF {
		if p.ended {
			return count, err
		} else {
			return count, nil
		}
	}

	return count, err
}

func (p *PassThrough) Close() {
	p.ended = true
}

func TestStream(t *testing.T) {
	givenBuffer := bytes.NewBuffer(make([]byte, 0))
	validingBuffer := bytes.NewBuffer(make([]byte, 0))

	pass := NewPassThrough(givenBuffer)
	subject, err := NewStream(pass)
	file, err := os.Open(subject.File.Name())

	if err != nil {
		t.Fatal("Failed to open reading file...")
	}

	// Don't leak temp files...
	defer func() {
		file.Close()
		err := os.Remove(subject.File.Name())
		if err != nil {
			t.Fatal("Could not handle err", err)
		}
	}()

	if err != nil {
		t.Fatal(err)
		return
	}

	group := sync.WaitGroup{}
	handle := subject.Observe()

	group.Add(1)
	go func() {
		// Begin consuming data from the stream...
		err := subject.Consume()
		if err != nil {
			t.Fatal("Failed to start consume")
		}
		group.Done()
	}()

	write := func(value string) {
		// Mirror the writes so we can verify later that what we read back from the
		// sink file is correct...
		givenBuffer.WriteString(value)
		validingBuffer.WriteString(value)
	}

	write("woot\n")
	// Allocate a large byte range to verify that we are reading back the correct
	// data.
	for i := 0; i < 1000; i++ {
		write(fmt.Sprintf("%v\n", i))
	}
	write("eof")

	// Close sometime later...
	go pass.Close()

	lastOffset := 0
	for event := range handle.Events {
		if event.Err != nil && event.Err != io.EOF {
			t.Fatal(event.Err)
		}

		if event.Offset != lastOffset {
			expectedLen := event.Offset - lastOffset

			// fill the assertion buffer
			expectedBuf := validingBuffer.Bytes()[lastOffset:event.Offset]

			// fill the actual buffer
			actualBuf := make([]byte, expectedLen)
			_, err := file.ReadAt(actualBuf, int64(lastOffset))
			if err != nil {
				t.Fatal("Could not read from sink", err)
			}

			if !bytes.Equal(expectedBuf, actualBuf) {
				t.Fatal("Buffer mismatch when reading offsets...")
			}
		}

		lastOffset = event.Offset
		// Break the loop once we are finished...
		if event.End {
			break
		}
	}

	// Just for sanity ensure the thing has finished the consume cycle...
	group.Wait()

	// Ensure the final read of the underlying file makes sense...
	actualBuf := make([]byte, len(validingBuffer.Bytes()))
	file.ReadAt(actualBuf, 0)

	if !bytes.Equal(actualBuf, validingBuffer.Bytes()) {
		t.Fatal("Final values for sink and buffer do not match")
	}
}
