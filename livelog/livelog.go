// Package livelog provides a simple wrapper around the livelog executable.
// After the generic worker is refactored into engines, plugins and a runtime,
// livelog will be a plugin instead.
package livelog

import (
	"io"
	"net/http"
	"os"
	"os/exec"

	"github.com/taskcluster/slugid-go/slugid"
)

// LiveLog provides access to a livelog process running on the OS. Use
// New(liveLogExecutable string) to start a new livelog instance.
type LiveLog struct {
	secret  string
	command *exec.Cmd
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
// Please note the GetURL is for the loopback interface - it is beyond the
// scope of this library to transform this localhost URL into a URL with a
// fully qualified hostname using package
// github.com/taskcluster/stateless-dns-go/hostname since this package can be
// used independently of the former one.
func New(liveLogExecutable string) (*LiveLog, error) {
	l := &LiveLog{
		secret:  slugid.Nice(),
		command: exec.Command(liveLogExecutable),
	}
	l.command.Env = append(os.Environ(), "ACCESS_TOKEN="+l.secret)
	err := l.command.Start()
	if err != nil {
		return nil, err
	}
	l.setRequestURLs()
	l.connectInputStream()
	return l, nil
}

// Terminate will close the log writer, and then kill the livelog system
// process.
func (l *LiveLog) Terminate() error {
	l.logReader.Close()
	l.LogWriter.Close()
	return l.command.Process.Kill()
}

func (l *LiveLog) setRequestURLs() {
	scheme := "http"
	if os.Getenv("SERVER_CRT_FILE") != "" && os.Getenv("SERVER_KEY_FILE") != "" {
		scheme = "https"
	}
	l.putURL = scheme + "://localhost:60022/log"
	l.GetURL = scheme + "://localhost:60023/log/" + l.secret
}

func (l *LiveLog) connectInputStream() error {
	l.logReader, l.LogWriter = io.Pipe()
	req, err := http.NewRequest("PUT", l.putURL, l.logReader)
	if err != nil {
		return err
	}
	client := new(http.Client)
	// if an error occurs, not much we can do about it - and not serious as
	// backing log will be served anyway
	go client.Do(req)
	return nil
}
