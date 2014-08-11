package stream

import (
	"bytes"
	"fmt"
	"io"
	"log"
	"testing"
)

// Test structure which implements `Read` interface but EOF is suppressed until
// ended = true.
type PassThrough struct {
	buffer *bytes.Buffer
	ended  bool
}

func NewPassThrough(b *bytes.Buffer) PassThrough {
	return PassThrough{
		buffer: b,
		ended:  false,
	}
}

func (p PassThrough) Read(buf []byte) (n int, err error) {
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

func TestNotifications(t *testing.T) {
	buffer := bytes.NewBuffer(make([]byte, 0))
	pass := NewPassThrough(buffer)
	subject, err := NewStream()
	log.Println("%v", subject.File.Name())

	// Don't leak temp files...
	defer subject.Close()

	if err != nil {
		log.Fatal(err)
		return
	}

	// issue a single notification...
	listener := make(chan int)
	subject.AddListener(listener)
	subject.SetContents(pass)

	count := 0
	write := func(value string) {
		count++
		buffer.WriteString(value)
	}

	write("woot\n")
	offset := <-listener
	if offset != 5 {
		log.Fatal("Expected offset to be %v was %v", 5, offset)
		return
	}

	for i := 0; i < 1000; i++ {
		write(fmt.Sprintf("woot number %v \n", i))
	}
	content := bytes.NewBuffer(make([]byte, 0))
	writeAllErr := subject.WriteAllTo(content)
	log.Println(writeAllErr)
	log.Println(string(content.Bytes()))
}
