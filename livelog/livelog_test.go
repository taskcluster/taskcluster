package livelog

import (
	"fmt"
	"io/ioutil"
	"net/http"
	"net/http/httputil"
	"runtime"
	"testing"
)

func TestLiveLog(t *testing.T) {
	var executable string
	switch runtime.GOOS {
	case "windows":
		executable = "livelog.exe"
	default:
		executable = "livelog"
	}
	ll, err := New(executable, "", "", 34567, 34568)
	// Do defer before checking err since err could be a different error and
	// process may have already started up.
	//
	// TODO: Think about if there is a better way to handle this, e.g. with a
	// callback function or the method itself killing the process if there is
	// an error after process is started up, etc. Maybe not worth the work as
	// this will be refactored later to not use livelog in a separate process,
	// but in a different go routine.
	defer func() {
		err := ll.Terminate()
		if err != nil {
			t.Fatalf("Failed to terminate livelog process:\n%s", err)
		}
	}()
	if err != nil {
		t.Fatalf("Could not initiate livelog process:\n%s", err)
	}
	_, err = fmt.Fprintln(ll.LogWriter, "Test line")
	if err != nil {
		t.Fatalf("Could not write test line to livelog:\n%s", err)
	}
	// This is required since livelog does not open the GET port until it first
	// writes data to it, which probably should be fixed in the livelog
	// codebase. Ideally it would serve both ports on initialisation, not
	// requiring data to be PUT first.
	waitForPortToBeActive(ll.GETPort)
	resp, err := http.Get(ll.GetURL)
	if err != nil {
		t.Fatalf("Could not GET livelog from URL %s:\n%s", ll.GetURL, err)
	}
	ll.LogWriter.Close()
	rawResp, err := httputil.DumpResponse(resp, true)
	if err != nil {
		t.Fatalf("Could not read HTTP response from URL %s:\n%s", ll.GetURL, err)
	}
	respString, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("Could not read HTTP body from URL %s:\n%s", ll.GetURL, err)
	}
	if string(respString) != "Test line\n" {
		t.Fatalf("Live log feed did not match data written:\n%q != %q\nGET url: %s\nFull Response:\n%s", string(respString), "Test line\n", ll.GetURL, string(rawResp))
	}
}
