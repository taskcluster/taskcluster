// Package livelog provides a simple wrapper around the livelog executable.
// After the generic worker is refactored into engines, plugins and a runtime,
// livelog will be a plugin instead.
package livelog

import (
	"bytes"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"sync"
	"time"

	"github.com/taskcluster/slugid-go/slugid"
	"github.com/taskcluster/taskcluster/v46/internal/httputil"
)

// LiveLog provides access to a livelog process running on the OS. Use
// New(liveLogExecutable string) to start a new livelog instance.
type LiveLog struct {
	secret  string
	PUTPort uint16
	GETPort uint16
	// The localhost URL where GET requests will get a streaming copy of the log
	GetURL string
	// The localhost URL where PUT requests can add to the accumulating log data
	putURL    string
	logReader io.ReadCloser
	// The io.WriteCloser to write your log to
	LogWriter io.WriteCloser
	mutex     sync.Mutex
	command   *exec.Cmd
	done      chan (struct{})
}

// New starts a livelog OS process using the executable specified, and returns
// a *LiveLog. The *LiveLog provides an HTTP service on the getPort which can be used to
// tail the log by multiple consumers in parallel, together with an
// io.WriteCloser where the logs should be written to. It is envisanged that
// the io.WriteCloser is passed on to the executing process.
func New(liveLogExecutable string, putPort, getPort uint16) (*LiveLog, error) {
	l := &LiveLog{
		secret:  slugid.Nice(),
		command: exec.Command(liveLogExecutable),
		PUTPort: putPort,
		GETPort: getPort,
		done:    make(chan (struct{})),
	}
	l.setRequestURLs()

	os.Setenv("ACCESS_TOKEN", l.secret)
	os.Setenv("LIVELOG_GET_PORT", strconv.Itoa(int(l.GETPort)))
	os.Setenv("LIVELOG_PUT_PORT", strconv.Itoa(int(l.PUTPort)))
	// we want to explicitly prohibit the process to use TLS
	os.Unsetenv("SERVER_KEY_FILE")
	os.Unsetenv("SERVER_CRT_FILE")

	type CommandResult struct {
		b []byte
		e error
	}
	putResult := make(chan CommandResult)
	go func() {
		defer close(putResult)
		var b bytes.Buffer
		l.command.Stdout = &b
		l.command.Stderr = &b
		l.mutex.Lock()
		e := l.command.Start()
		l.mutex.Unlock()
		if e != nil {
			putResult <- CommandResult{
				b: []byte{},
				e: e,
			}
			return
		}
		e = l.command.Wait()
		putResult <- CommandResult{
			b: b.Bytes(),
			e: e,
		}
	}()

	inputStreamConnectionResult := make(chan error)
	go func() {
		defer close(inputStreamConnectionResult)
		err := l.connectInputStream()
		inputStreamConnectionResult <- err
	}()

	select {
	case err := <-inputStreamConnectionResult:
		go func() {
			select {
			case <-l.done:
			case pr := <-putResult:
				log.Printf("WARNING: Livelog failure: error '%v' and livelog output:\n%s", pr.e, pr.b)
			}
		}()
		if err != nil {
			return nil, err
		}
	case pr := <-putResult:
		if pr.e != nil {
			return nil, fmt.Errorf("WARNING: Livelog terminated early with error '%v' and output:\n%s", pr.e, pr.b)
		}
		return nil, fmt.Errorf("WARNING: Livelog terminated early *without* error and with output:\n%s", pr.b)
	}
	return l, nil
}

// Terminate will close the log writer, and then kill the livelog system
// process.
func (l *LiveLog) Terminate() error {
	// DON'T close the reader!!! otherwise PUT will fail
	// i.e DON'T write `l.logReader.Close()`
	l.LogWriter.Close()
	l.mutex.Lock()
	close(l.done)
	defer l.mutex.Unlock()
	return l.command.Process.Kill()
}

func (l *LiveLog) setRequestURLs() {
	l.putURL = fmt.Sprintf("http://localhost:%v/log", l.PUTPort)
	l.GetURL = fmt.Sprintf("http://localhost:%v/log/%v", l.GETPort, l.secret)

}

func (l *LiveLog) connectInputStream() error {
	l.logReader, l.LogWriter = io.Pipe()
	req, err := http.NewRequest("PUT", l.putURL, l.logReader)
	if err != nil {
		return err
	}
	client := new(http.Client)
	// We need to wait until PUT port is opened which is some time after the
	// livelog process has started...
	// Note we can't wait for GET port to be active before returning since
	// livelog will only serve from that port once some content is sent - so no
	// good to execute httputil.WaitForLocalTCPListener(l.getPort) here...  We
	// would need to fix this in livelog codebase not here...
	err = httputil.WaitForLocalTCPListener(l.PUTPort, time.Minute*1)
	if err != nil {
		return err
	}
	go func() {
		// Error only needed to know if we should close request body or not.
		// Ignore it for all other purposes.
		resp, err := client.Do(req)
		if err == nil {
			defer resp.Body.Close()
		}
	}()
	return nil
}
