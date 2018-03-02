package main

import "testing"

func TestNoTaskNoScopes(t *testing.T) {
	routes, port := ParseCommandArgs([]string{})
	if routes.Credentials.AuthorizedScopes != nil {
		t.Fatalf("Was expecting no AuthorizedScopes restriction, but got: %v", routes.Credentials.AuthorizedScopes)
	}
	if port != 8080 {
		t.Fatalf("Was expecting port 80, but got port %v.", port)
	}
}

func TestNondefaultPort(t *testing.T) {
	_, port := ParseCommandArgs([]string{
		"--port",
		"12345",
	})
	if port != 12345 {
		t.Fatalf("Was expecting port 12345, but got port %v.", port)
	}
}

func TestWithTwoScopes(t *testing.T) {
	routes, port := ParseCommandArgs([]string{
		"--client-id", "abc",
		"--certificate", "def",
		"--access-token", "ghi",
		"--port", "12345",
		// scopes
		"a:b:c",
		"d:e:f",
	})
	if port != 12345 {
		t.Fatalf("Was expecting port 12345, but got port %v.", port)
	}
	if clientID := routes.Credentials.ClientID; clientID != "abc" {
		t.Fatalf("Was expecting client id 'abc', but got client id %v.", clientID)
	}
	if cert := routes.Credentials.Certificate; cert != "def" {
		t.Fatalf("Was expecting certificate 'def', but got certificate %v.", cert)
	}
	if accessToken := routes.Credentials.AccessToken; accessToken != "ghi" {
		t.Fatalf("Was expecting access token 'ghi', but got access token %v.", accessToken)
	}
	if scopes := routes.Credentials.AuthorizedScopes; len(scopes) != 2 || (scopes[0]+" "+scopes[1] != "a:b:c d:e:f" && scopes[1]+" "+scopes[0] != "a:b:c d:e:f") {
		t.Fatalf("Was expecting authorized scopes to contain 'a:b:c' and 'd:e:f', but instead got: %v", scopes)
	}
}

func TestWithTaskWithNoScopes(t *testing.T) {
	routes, _ := ParseCommandArgs([]string{
		"--task-id", "KTBKfEgxR5GdfIIREQIvFQ",
	})
	if scopes := routes.Credentials.AuthorizedScopes; scopes == nil || len(scopes) > 0 {
		t.Fatalf("Was expecting authorized scopes to be an empty non-nil array, but instead got: %v", scopes)
	}
}

func TestWithTaskWithScopes(t *testing.T) {
	routes, _ := ParseCommandArgs([]string{
		"--task-id", "eQgo-rE5RHWgHeYRKGrHKA",
	})
	if scopes := routes.Credentials.AuthorizedScopes; len(scopes) != 1 || scopes[0] != "queue:get-artifact:SampleArtifacts/_/X.txt" {
		t.Fatalf("Was expecting authorized scopes to be the single scope queue:get-artifact:SampleArtifacts/_/X.txt, but instead got: %v", scopes)
	}
}
