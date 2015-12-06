// Package livelog provides a simple wrapper around the livelog executable.
// After the generic worker is refactored into engines, plugins and a runtime,
// livelog will be a plugin instead.
package livelog

import (
	"fmt"
	"io"
	"net/http"
	"net/http/httputil"
	"os"
	"os/exec"
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
func New(liveLogExecutable, sslCert, sslKey string) (*LiveLog, error) {
	l := &LiveLog{
		secret:  slugid.Nice(),
		command: exec.Command(liveLogExecutable),
		sslCert: sslCert,
		sslKey:  sslKey,
	}
	l.command.Env = append(
		os.Environ(),
		"ACCESS_TOKEN="+l.secret,
		"SERVER_CRT_FILE="+l.sslCert,
		"SERVER_KEY_FILE="+l.sslKey,
	)
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
	go func() {
		// TODO: this is a HORRENDOUS hack - need to fix this
		// Basically we need to wait until put port is opened
		// which is some time after the livelog process has
		// started...
		time.Sleep(500 * time.Millisecond)
		// resp, _, err := httpbackoff.ClientDo(client, req)
		resp, err := client.Do(req)
		if err != nil {
			panic(err)
		}
		output, err := httputil.DumpResponse(resp, true)
		if err != nil {
			panic(err)
		}
		fmt.Println(string(output))
	}()
	return nil
}
