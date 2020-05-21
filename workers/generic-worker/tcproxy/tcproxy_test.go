package tcproxy

import (
	"encoding/json"
	"io/ioutil"
	"net/http"
	"runtime"
	"testing"

	tcclient "github.com/taskcluster/taskcluster/v30/clients/client-go"
	"github.com/taskcluster/taskcluster/v30/clients/client-go/tcauth"
	"github.com/taskcluster/taskcluster/v30/internal/testrooturl"
)

func TestTcProxy(t *testing.T) {
	rootURL, clientID, accessToken, certificate := testrooturl.GetWithCreds(t)
	var executable string
	switch runtime.GOOS {
	case "windows":
		executable = "taskcluster-proxy.exe"
	default:
		executable = "taskcluster-proxy"
	}
	creds := &tcclient.Credentials{
		ClientID:         clientID,
		AccessToken:      accessToken,
		Certificate:      certificate,
		AuthorizedScopes: []string{"queue:get-artifact:SampleArtifacts/_/X.txt"},
	}
	ll, err := New(executable, 34569, rootURL, creds)
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
	res, err := http.Get("http://localhost:34569/auth/v1/scopes/current")
	if err != nil {
		t.Fatalf("Could not hit url to download artifact using taskcluster-proxy: %v", err)
	}
	defer res.Body.Close()
	data, err := ioutil.ReadAll(res.Body)
	if err != nil {
		t.Fatalf("Could not read artifact using taskcluster-proxy: %v", err)
	}
	scopeset := new(tcauth.SetOfScopes)
	err = json.Unmarshal(data, scopeset)
	if err != nil {
		t.Fatalf("Could not interpret response %q as json: %v", string(data), err)
	}
	if len(scopeset.Scopes) != 1 || scopeset.Scopes[0] != "queue:get-artifact:SampleArtifacts/_/X.txt" {
		t.Fatalf("Got incorrect data: %v", string(data))
	}
}
