package tcproxy

import (
	"io/ioutil"
	"net/http"
	"os"
	"runtime"
	"testing"

	tcclient "github.com/taskcluster/taskcluster-client-go"
)

func TestTaskclusterProxy(t *testing.T) {
	var executable string
	switch runtime.GOOS {
	case "windows":
		executable = "taskcluster-proxy.exe"
	default:
		executable = "taskcluster-proxy"
	}
	creds := &tcclient.Credentials{
		ClientID:    os.Getenv("TASKCLUSTER_CLIENT_ID"),
		AccessToken: os.Getenv("TASKCLUSTER_ACCESS_TOKEN"),
		Certificate: os.Getenv("TASKCLUSTER_CERTIFICATE"),
	}
	ll, err := New(executable, 34569, creds, "KTBKfEgxR5GdfIIREQIvFQ")
	// Do defer before checking err since err could be a different error and
	// process may have already started up.
	defer func() {
		err := ll.Terminate()
		if err != nil {
			t.Fatalf("Failed to terminate taskcluster-proxy process:\n%s", err)
		}
	}()
	if err != nil {
		t.Fatalf("Could not initiate taskcluster-proxy process:\n%s", err)
	}
	res, err := http.Get("http://localhost:34569/queue/v1/task/KTBKfEgxR5GdfIIREQIvFQ/runs/0/artifacts/SampleArtifacts/_/X.txt")
	if err != nil {
		t.Fatalf("Could not hit url to download artifact using taskcluster-proxy: %v", err)
	}
	defer res.Body.Close()
	data, err := ioutil.ReadAll(res.Body)
	if err != nil {
		t.Fatalf("Could not read artifact using taskcluster-proxy: %v", err)
	}
	if string(data) != "test artifact\n" {
		t.Fatalf("Got incorrect data: %v", string(data))
	}
}
