package livelog

import (
	"fmt"
	"net/http"
	"net/http/httputil"
	"testing"
)

func GoodPipeTest(t *testing.T) {
	ll, err := New("livelog")
	if err != nil {
		t.Fatalf("Could not initiate livelog process:\n%s", err)
	}
	_, err = fmt.Fprintln(ll.LogWriter, "Test line")
	if err != nil {
		t.Fatalf("Could not write test line to livelog:\n%s", err)
	}
	resp, err := http.Get(ll.GetURL)
	if err != nil {
		t.Fatalf("Could not GET livelog from URL %s:\n%s", ll.GetURL, err)
	}
	result, err := httputil.DumpResponse(resp, true)
	if err != nil {
		t.Fatalf("Could not read HTTP response from URL %s:\n%s", ll.GetURL, err)
	}
	if string(result) != "Test line\n" {
		t.Fatalf("Live log feed did not match data written")
	}
}
