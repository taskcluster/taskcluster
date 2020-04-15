package workerproto

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
)

// PipeTransport implements the worker-runner protocol over a pipe.  It reads
// from its input in the `Recv` method, and writes to its output in Send.  It
// is safe to assume that a message has been handed to the OS when Send
// returns.
type PipeTransport struct {
	input  io.Reader
	output io.Writer

	readEOF  bool
	inBuffer []byte
}

// Create a new PipeTransport.  The result will read from input and write to
// output.
func NewPipeTransport(input io.Reader, output io.Writer) *PipeTransport {
	return &PipeTransport{
		input:  input,
		output: output,
	}
}

// workerproto.Transport interface

func (transp *PipeTransport) Send(msg Message) {
	j, err := json.Marshal(&msg)
	if err != nil {
		log.Printf("could not marshal protocol message: %v", err)
		return
	}
	j = append(append([]byte{'~'}, j...), '\n')

	for len(j) > 0 {
		n, err := transp.output.Write(j)
		if err == nil {
			return
		}
		if n == 0 {
			log.Printf("could not write protocol message: %v", err)
			return
		}
		j = j[n:]
	}
}

func (transp *PipeTransport) Recv() (msg Message, ok bool) {
	for {
		newline := bytes.IndexRune(transp.inBuffer, '\n')
		if !transp.readEOF && newline == -1 {
			p := make([]byte, 4096)
			n, err := transp.input.Read(p)
			if n > 0 {
				transp.inBuffer = append(transp.inBuffer, p[:n]...)
			}
			if err != nil {
				if err != io.EOF {
					log.Printf("error reading from protocol: %v", err)
				}
				transp.readEOF = true
			}
		}

		newline = bytes.IndexRune(transp.inBuffer, '\n')

		if newline != -1 {
			invalid := false
			line := bytes.TrimSpace(transp.inBuffer[:newline])
			transp.inBuffer = transp.inBuffer[newline+1:]

			if len(line) < 3 || line[0] != '~' || line[1] != '{' || line[len(line)-1] != '}' {
				invalid = true
			}

			if !invalid {
				err := json.Unmarshal(line[1:], &msg)
				if err != nil {
					invalid = true
				}
			}

			if invalid {
				// strip the newline and hand this to the logger as unstructured data
				log.Println(string(line))
			} else {
				ok = true
				return
			}
		} else {
			if transp.readEOF {
				ok = false
				return
			}
		}
	}
}
