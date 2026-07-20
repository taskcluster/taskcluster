package tcproxy

import (
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"runtime"
	"testing"

	tcclient "github.com/taskcluster/taskcluster/v102/clients/client-go"
	"github.com/taskcluster/taskcluster/v102/clients/client-go/tcauth"
	"github.com/taskcluster/taskcluster/v102/internal/scopes"
	"github.com/taskcluster/taskcluster/v102/internal/testrooturl"
)

func getFreePort(t *testing.T) uint16 {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("Could not find a free port: %v", err)
	}
	defer listener.Close()
	return uint16(listener.Addr().(*net.TCPAddr).Port)
}

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
	port := getFreePort(t)
	ll, err := New(executable, "127.0.0.1", port, rootURL, creds, "", "")
	if err != nil {
		t.Fatalf("Could not initiate taskcluster-proxy process:\n%s", err)
	}
	defer func() {
		err := ll.Terminate()
		if err != nil {
			t.Fatalf("Failed to terminate taskcluster-proxy process:\n%s", err)
		}
	}()
	res, err := http.Get(fmt.Sprintf("http://localhost:%d/auth/v1/scopes/current", port))
	if err != nil {
		t.Fatalf("Could not hit url to download artifact using taskcluster-proxy: %v", err)
	}
	defer res.Body.Close()
	data, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatalf("Could not read artifact using taskcluster-proxy: %v", err)
	}
	scopeset := new(tcauth.SetOfScopes)
	err = json.Unmarshal(data, scopeset)
	if err != nil {
		t.Fatalf("Could not interpret response %q as json: %v", string(data), err)
	}

	// check that the current scopes satisfy the authorized scopes
	given := scopes.Given(scopeset.Scopes)
	required := scopes.Required([][]string{[]string{"queue:get-artifact:SampleArtifacts/_/X.txt"}})
	if ok, err := given.Satisfies(required, tcauth.New(nil, rootURL)); !ok || err != nil {
		t.Fatalf("Got current scopes %s that do not satisfy authorized scopes %s: %v", string(data), required, err)
	}
}
