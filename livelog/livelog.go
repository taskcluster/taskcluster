// Package livelog provides a simple wrapper around the livelog executable.
// After the generic worker is refactored into engines, plugins and a runtime,
// livelog will be a plugin instead.
package livelog

import (
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"time"

	"github.com/taskcluster/slugid-go/slugid"
)

// LiveLog provides access to a livelog process running on the OS. Use
// New(liveLogExecutable string) to start a new livelog instance.
type LiveLog struct {
	sslCert string
	sslKey  string
	secret  string
	command *exec.Cmd
	PUTPort uint16
	GETPort uint16
	putURL  string
	// The fully qualified HTTP GET URL where the log will be published.
	GetURL    string
	logReader io.ReadCloser
	// The io.WriteCloser to write your log to
	LogWriter io.WriteCloser
}

// New starts a livelog OS process using the executable specified, and returns
// a *LiveLog. The *LiveLog provides access to the GetURL which can be used to
// tail the log by multiple consumers in parallel, together with an
// io.WriteCloser where the logs should be written to. It is envisanged that
// the io.WriteCloser is passed on to the executing process.
//
// sslCert and sslKey should be used to specify the file location of a
// suitable certificate and key on the local filesystem that can be used
// for hosting the livelog service over https. If either is an empty string
// the livelog will resort to running over http transport instead.
//
// Please note the GetURL is for the loopback interface - it is beyond the
// scope of this library to transform this localhost URL into a URL with a
// fully qualified hostname using package
// github.com/taskcluster/stateless-dns-go/hostname since this package can be
// used independently of the former one.
func New(liveLogExecutable, sslCert, sslKey string, putPort, getPort uint16) (*LiveLog, error) {
	l := &LiveLog{
		secret:  slugid.Nice(),
		command: exec.Command(liveLogExecutable),
		sslCert: sslCert,
		sslKey:  sslKey,
		PUTPort: putPort,
		GETPort: getPort,
	}
	os.Setenv("ACCESS_TOKEN", l.secret)
	os.Setenv("LIVELOG_GET_PORT", strconv.Itoa(int(l.GETPort)))
	os.Setenv("LIVELOG_PUT_PORT", strconv.Itoa(int(l.PUTPort)))
	os.Setenv("SERVER_CRT_FILE", l.sslCert)
	os.Setenv("SERVER_KEY_FILE", l.sslKey)
	l.command.Env = os.Environ()
	err := l.command.Start()
	// TODO: we need to make sure that this livelog process we just started
	// doesn't just exit, which can happen if the port is already in use!!!
	// Note, this is really bad, since another livelog will use a different
	// secret. Also note we get a 0 exit code when process exits because
	// another process was listening on the port(s).
	if err != nil {
		return nil, err
	}
	l.setRequestURLs()
	err = l.connectInputStream()
	// Note we can't wait for GET port to be active before returning since
	// livelog will only serve from that port once some content is sent - so no
	// good to execute waitForPortToBeActive(l.getPort) here...  We would need
	// to fix this in livelog codebase not here...
	return l, err
}

// Terminate will close the log writer, and then kill the livelog system
// process.
func (l *LiveLog) Terminate() error {
	// DON'T close the reader!!! otherwise PUT will fail
	// i.e DON'T write `l.logReader.Close()`
	l.LogWriter.Close()
	return l.command.Process.Kill()
}

func (l *LiveLog) setRequestURLs() {
	scheme := "http"
	if os.Getenv("SERVER_CRT_FILE") != "" && os.Getenv("SERVER_KEY_FILE") != "" {
		scheme = "https"
	}
	l.putURL = fmt.Sprintf("%v://localhost:%v/log", scheme, l.PUTPort)
	l.GetURL = fmt.Sprintf("%v://localhost:%v/log/%v", scheme, l.GETPort, l.secret)
}

func (l *LiveLog) connectInputStream() error {
	l.logReader, l.LogWriter = io.Pipe()
	req, err := http.NewRequest("PUT", l.putURL, l.logReader)
	if err != nil {
		return err
	}
	client := new(http.Client)
	go func() {
		// We need to wait until put port is opened which is some time after the
		// livelog process has started...
		waitForPortToBeActive(l.PUTPort)
		// since we waited so long, maybe livelog service isn't running now, so
		// ignore any error and response we get back...
		client.Do(req)
	}()
	return nil
}

func waitForPortToBeActive(port uint16) {
	deadline := time.Now().Add(60 * time.Second)
	for time.Now().Before(deadline) {
		conn, err := net.DialTimeout("tcp", "localhost:"+strconv.Itoa(int(port)), 60*time.Second)
		if err != nil {
			time.Sleep(100 * time.Millisecond)
		} else {
			_ = conn.Close()
			break
		}
	}
}
