package tcproxy

import (
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"regexp"
	"runtime"
	"testing"
	"time"

	tcclient "github.com/taskcluster/taskcluster/v110/clients/client-go"
	"github.com/taskcluster/taskcluster/v110/clients/client-go/tcauth"
	"github.com/taskcluster/taskcluster/v110/clients/client-go/tcqueue"
	"github.com/taskcluster/taskcluster/v110/internal/scopes"
	"github.com/taskcluster/taskcluster/v110/internal/testrooturl"
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

func proxyExecutable() string {
	if runtime.GOOS == "windows" {
		return "taskcluster-proxy.exe"
	}
	return "taskcluster-proxy"
}

func TestUpdateCredentials(t *testing.T) {
	// Fake deployment that records the Hawk id the proxy signs requests with.
	signedWith := make(chan string, 100)
	hawkID := regexp.MustCompile(`id="([^"]*)"`)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if m := hawkID.FindStringSubmatch(r.Header.Get("Authorization")); m != nil {
			signedWith <- m[1]
		}
		_, _ = w.Write([]byte("{}"))
	}))
	defer upstream.Close()

	creds := &tcclient.Credentials{
		ClientID:    "original-client",
		AccessToken: "original-token",
	}
	port := getFreePort(t)
	ll, err := New(proxyExecutable(), "127.0.0.1", port, upstream.URL, creds, "", "")
	if err != nil {
		t.Fatalf("Could not initiate taskcluster-proxy process:\n%s", err)
	}
	defer func() {
		if err := ll.Terminate(); err != nil {
			t.Fatalf("Failed to terminate taskcluster-proxy process:\n%s", err)
		}
	}()

	err = ll.UpdateCredentials(&tcqueue.TaskCredentials{
		ClientID:    "refreshed-client",
		AccessToken: "refreshed-token",
	})
	if err != nil {
		t.Fatalf("Could not update credentials: %v", err)
	}

	// The proxy applies stdin updates asynchronously, so poll until a
	// proxied request is signed with the refreshed credentials.
	url := fmt.Sprintf("http://127.0.0.1:%d/auth/v1/scopes/current", port)
	deadline := time.Now().Add(10 * time.Second)
	for {
		res, err := http.Get(url)
		if err != nil {
			t.Fatalf("Could not make request through taskcluster-proxy: %v", err)
		}
		res.Body.Close()
		select {
		case id := <-signedWith:
			if id == "refreshed-client" {
				return
			}
		case <-time.After(5 * time.Second):
			t.Fatal("upstream did not receive a signed request from taskcluster-proxy")
		}
		if time.Now().After(deadline) {
			t.Fatal("taskcluster-proxy never started signing with the refreshed credentials")
		}
		time.Sleep(100 * time.Millisecond)
	}
}

func TestUpdateCredentialsAfterTerminate(t *testing.T) {
	ll := startProxy(t)
	if err := ll.Terminate(); err != nil {
		t.Fatalf("Failed to terminate taskcluster-proxy process:\n%s", err)
	}
	if err := ll.UpdateCredentials(&tcqueue.TaskCredentials{ClientID: "new"}); err == nil {
		t.Fatal("Expected an error updating credentials of a terminated proxy")
	}
}

// startProxy starts a taskcluster-proxy that is never sent any requests.
func startProxy(t *testing.T) *TaskclusterProxy {
	t.Helper()
	creds := &tcclient.Credentials{
		ClientID:    "client",
		AccessToken: "token",
	}
	ll, err := New(proxyExecutable(), "127.0.0.1", getFreePort(t), "http://127.0.0.1:1", creds, "", "")
	if err != nil {
		t.Fatalf("Could not initiate taskcluster-proxy process:\n%s", err)
	}
	return ll
}

// waitForExit waits for the proxy process to exit on its own, and returns
// its exit code.
func waitForExit(t *testing.T, ll *TaskclusterProxy) int {
	t.Helper()
	exited := make(chan error, 1)
	go func() { exited <- ll.command.Wait() }()
	select {
	case <-exited:
		return ll.command.ProcessState.ExitCode()
	case <-time.After(10 * time.Second):
		_ = ll.command.Process.Kill()
		t.Fatal("taskcluster-proxy did not exit")
		return -1
	}
}

func TestProxyExitsWhenStdinClosed(t *testing.T) {
	ll := startProxy(t)
	if err := ll.stdin.Close(); err != nil {
		t.Fatalf("Could not close taskcluster-proxy stdin: %v", err)
	}
	if code := waitForExit(t, ll); code != 0 {
		t.Fatalf("Expected taskcluster-proxy to exit with code 0, but got %d", code)
	}
}

func TestProxyExitsOnInvalidCredentials(t *testing.T) {
	ll := startProxy(t)
	defer ll.stdin.Close()
	if _, err := ll.stdin.Write([]byte("{\"badJS0n!\n")); err != nil {
		t.Fatalf("Could not write to taskcluster-proxy stdin: %v", err)
	}
	if code := waitForExit(t, ll); code == 0 {
		t.Fatal("Expected taskcluster-proxy to exit with a non-zero code")
	}
	// the worker must get an error, not block, if the proxy has gone away
	if err := ll.UpdateCredentials(&tcqueue.TaskCredentials{ClientID: "new"}); err == nil {
		t.Fatal("Expected an error updating credentials of an exited proxy")
	}
}

func TestTcProxy(t *testing.T) {
	rootURL, clientID, accessToken, certificate := testrooturl.GetWithCreds(t)
	executable := proxyExecutable()
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
