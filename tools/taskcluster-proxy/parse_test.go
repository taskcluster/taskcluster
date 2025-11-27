package main

import (
	"fmt"
	"testing"

	"github.com/taskcluster/taskcluster/v94/clients/client-go/tcqueue"
)

func TestNoTaskNoScopes(t *testing.T) {
	routes, address, err := ParseCommandArgs(
		[]string{
			"--root-url", "https://tc-tests.example.com",
			"--client-id", "abc",
			"--access-token", "ghi",
		},
		false,
	)
	if err != nil {
		t.Fatalf("%v", err)
	}
	if routes.Credentials.AuthorizedScopes != nil {
		t.Fatalf("Was expecting no AuthorizedScopes restriction, but got: %v", routes.Credentials.AuthorizedScopes)
	}
	if address != ":8080" {
		t.Fatalf("Was expecting address ':8080', but got address '%v'.", address)
	}
}

func TestNondefaultPort(t *testing.T) {
	_, address, err := ParseCommandArgs(
		[]string{
			"--root-url", "https://tc-tests.example.com",
			"--client-id", "abc",
			"--access-token", "ghi",
			"--port", "12345",
		},
		false,
	)
	if err != nil {
		t.Fatalf("%v", err)
	}
	if address != ":12345" {
		t.Fatalf("Was expecting address ':12345', but got address '%v'.", address)
	}
}

func TestWithTwoScopes(t *testing.T) {
	routes, address, err := ParseCommandArgs(
		[]string{
			"--root-url", "https://tc-tests.example.com",
			"--client-id", "abc",
			"--certificate", "def",
			"--access-token", "ghi",
			"--port", "12345",
			// scopes
			"a:b:c",
			"d:e:f",
		},
		false,
	)
	if err != nil {
		t.Fatalf("%v", err)
	}
	if address != ":12345" {
		t.Fatalf("Was expecting address ':12345', but got address '%v'.", address)
	}
	if clientID := routes.Credentials.ClientID; clientID != "abc" {
		t.Fatalf("Was expecting client id 'abc', but got client id '%v'.", clientID)
	}
	if cert := routes.Credentials.Certificate; cert != "def" {
		t.Fatalf("Was expecting certificate 'def', but got certificate '%v'.", cert)
	}
	if accessToken := routes.Credentials.AccessToken; accessToken != "ghi" {
		t.Fatalf("Was expecting access token 'ghi', but got access token '%v'.", accessToken)
	}
	if scopes := routes.Credentials.AuthorizedScopes; len(scopes) != 2 || (scopes[0]+" "+scopes[1] != "a:b:c d:e:f" && scopes[1]+" "+scopes[0] != "a:b:c d:e:f") {
		t.Fatalf("Was expecting authorized scopes to contain 'a:b:c' and 'd:e:f', but instead got: '%v'", scopes)
	}
}

func withFakeTask(expectedTaskID string, fakeTask *tcqueue.TaskDefinitionResponse) func() {
	oldGetTask := getTask
	getTask = func(rootURL string, taskID string) (task *tcqueue.TaskDefinitionResponse, err error) {
		if taskID == expectedTaskID {
			task = fakeTask
		} else {
			err = fmt.Errorf("Task not found")
		}
		return
	}
	return func() {
		getTask = oldGetTask
	}
}
func TestWithTaskWithNoScopes(t *testing.T) {
	defer withFakeTask("abc", &tcqueue.TaskDefinitionResponse{
		Scopes: nil,
	})()
	routes, _, err := ParseCommandArgs(
		[]string{
			"--task-id", "abc",
			"--root-url", "https://tc-tests.example.com",
			"--client-id", "abc",
			"--certificate", "def",
			"--access-token", "ghi",
		},
		false,
	)
	if err != nil {
		t.Fatalf("%v", err)
	}
	if scopes := routes.Credentials.AuthorizedScopes; scopes == nil || len(scopes) > 0 {
		t.Fatalf("Was expecting authorized scopes to be an empty non-nil array, but instead got: '%v'", scopes)
	}
}

func TestWithTaskWithScopes(t *testing.T) {
	exampleScope := "queue:get-artifact:taskcluster-proxy-test/512-random-bytes"
	defer withFakeTask("abc", &tcqueue.TaskDefinitionResponse{
		Scopes: []string{exampleScope},
	})()
	routes, _, err := ParseCommandArgs(
		[]string{
			"--task-id", "abc",
			"--root-url", "https://tc-tests.example.com",
			"--client-id", "abc",
			"--certificate", "def",
			"--access-token", "ghi",
		},
		false,
	)
	if err != nil {
		t.Fatalf("%v", err)
	}
	if scopes := routes.Credentials.AuthorizedScopes; len(scopes) != 1 || scopes[0] != exampleScope {
		t.Fatalf("Was expecting authorized scopes to be the single scope %v, but instead got: %v", exampleScope, scopes)
	}
}

func TestWithInterface(t *testing.T) {
	_, address, err := ParseCommandArgs(
		[]string{
			"--root-url", "https://tc-tests.example.com",
			"--client-id", "abc",
			"--certificate", "def",
			"--access-token", "ghi",
			"--port", "12345",
			"--ip-address", "172.17.0.44",
		},
		false,
	)
	if err != nil {
		t.Fatalf("%v", err)
	}
	if address != "172.17.0.44:12345" {
		t.Fatalf("Was expecting address '172.17.0.44:12345', but got address '%v'.", address)
	}
}

func TestBadPort(t *testing.T) {
	_, _, err := ParseCommandArgs(
		[]string{
			"--port", "-12345",
			"--ip-address", "172.17.0.44",
		},
		false,
	)
	if err == nil {
		t.Fatalf("Was expecting an error!")
	}
	if err.Error() != "port -12345 is not in range [0,65535]" {
		t.Fatalf("Was expecting error to say 'port -12345 is not in range [0,65535]' but it says: %v", err)
	}
}

func TestBadIPAddress(t *testing.T) {
	_, _, err := ParseCommandArgs(
		[]string{
			"--port", "12345",
			"--ip-address", "172.17.0.44.66",
		},
		false,
	)
	if err == nil {
		t.Fatalf("Was expecting an error!")
	}
	if err.Error() != "invalid IPv4/IPv6 address specified - cannot parse: 172.17.0.44.66" {
		t.Fatalf("Was expecting error to say 'invalid IPv4/IPv6 address specified - cannot parse: 172.17.0.44.66' but it says: %v", err)
	}
}
