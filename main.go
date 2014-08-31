package main

import (
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"

	"github.com/lightsofapollo/continuous-log-serve/writer"
	. "github.com/visionmedia/go-debug"
)

var debug = Debug("continuous-log-serve")

type Routes struct {
	stream   *writer.Stream
	reqGroup *sync.WaitGroup
}

func NewRoutes(stream *writer.Stream) *Routes {
	return &Routes{
		stream:   stream,
		reqGroup: &sync.WaitGroup{},
	}
}

func (self *Routes) ServeHTTP(writer http.ResponseWriter, req *http.Request) {
	handle := self.stream.Observe()
	file, err := os.Open(self.stream.File.Name())
	buffer := make([]byte, 8192)

	req.Header.Set("Content-Type", "text/plain; charset=utf-8")
	req.Header.Set("Content-Encoding", "chunked")

	if err != nil {
		writer.WriteHeader(500)
		return
	}

	// Send headers so its clear what we are trying to do...
	writer.WriteHeader(200)
	debug("wrote headers...")

	// Finalize the stream with single zero byte length write
	self.reqGroup.Add(1)
	defer func() {
		// Ensure we close our file handle...
		file.Close()
		// Ensure the stream is cleaned up after errors, etc...
		self.stream.Unobserve(handle)
		// Write final chunks errors here are not important.
		writer.Write(make([]byte, 0))

		// Ensure that any last bytes are flushed first...
		debug("send connection close...")
		self.reqGroup.Done()
	}()

	// TODO: Implement byte range fetching...

	ending := false
	for {
		debug("server begin read")
		bytesRead, err := file.Read(buffer)

		// Be careful to only write non zero length buffer (zero length buffer will
		// end the http stream!)
		if bytesRead > 0 {
			debug("Write to server %d bytes", bytesRead)
			// TODO: Handle write errors...
			wrote, err := writer.Write(buffer[0:bytesRead])

			// The intention here is speed over everything else so flush as soon as we
			// have some bytes this will result in many more packets and more overhead
			// from chunking but this is an okay trade off given the intention of the
			// fastest live logging possible over http.
			writer.(http.Flusher).Flush()
			log.Println(wrote, bytesRead)

			// Handle writer errors by aborting the connection...
			if err != nil {
				log.Println("Aborting http request writer failure...")
				return
			}

			// If we handled a successful read try reading again...
			continue
		}

		// We issue the flush after completely emptying any underlying files...
		//bufrw.Flush()

		// If we are ending break the loop...
		if ending {
			debug("server ending read")
			return
		}

		// If we are at the end of the sink wait until we have written more bytes to
		// it.
		if err == io.EOF {

			// If the stream has ended then we cannot wait for more events are we are
			// done so break the read loop...
			if self.stream.Ended {
				break
			}

			debug("waiting for event...")
			event := <-handle.Events
			debug(
				"got event offset: %d, end: %d, err: %v",
				event.Offset, event.End, event.Err,
			)
			ending = event.End

			// Handle errors which should close the stream...
			if event.Err != nil && event.Err != io.EOF {
				log.Println("Event error: %v", event.Err)
				break
			}
		} else if err != nil {
			log.Println("Unknown error reading: %v", err)
			break
		}
	}
}

func inputHandler(conn net.Conn) {
	defer conn.Close()
	// Create the stream server...
	listener, err := net.Listen("tcp", ":60023")
	if err != nil {
		log.Fatal("Could not create listener...")
	}

	stream, err := writer.NewStream(conn)
	if err != nil {
		log.Fatal("Failed to open writer stream")
	}

	// Begin consuming data from the underlying stream...
	go func() {
		debug("consuming from stream...")
		err := stream.Consume()
		if err != nil {
			log.Fatal("Consume error", err)
		}
	}()

	streamHandler := NewRoutes(stream)
	server := &http.Server{
		Handler: streamHandler,
	}

	_, port, err := net.SplitHostPort(listener.Addr().String())
	debug("http server listening on %s", port)
	if err != nil {
		log.Fatal("Failed to aquire port")
	}

	log.Printf("http://localhost:%s/", port)

	// Begin serving ...
	err = server.Serve(listener)
	if err != nil {
		log.Fatal("Error serving request", err)
	}
}

func inputServer() {
	dir, err := os.Getwd()
	if err != nil {
		log.Fatal("getwd error", err)
	}

	socket := fmt.Sprintf("%s/input.sock", dir)
	signalChan := make(chan os.Signal)
	signal.Notify(signalChan, syscall.SIGINT)
	debug("open socket %s", socket)

	// Cleanup on SIGINT
	go func() {
		<-signalChan
		os.Remove(socket)
		debug("SIGINT")
		os.Exit(1)
	}()

	server, err := net.Listen("unix", socket)
	defer os.Remove(socket)

	if err != nil {
		log.Fatal("Failed to open input socket ", socket)
	}

	defer server.Close()

	for {
		conn, err := server.Accept()
		if err != nil {
			log.Println("Error accepting connection...", err)
			continue
		}
		go inputHandler(conn)
	}
}

func main() {
	inputServer()
}
