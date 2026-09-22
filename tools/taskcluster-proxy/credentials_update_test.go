package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	tcclient "github.com/taskcluster/taskcluster/v110/clients/client-go"
)

type RoutesTest struct {
	Routes
	t *testing.T
}

func TestCredentialsUpdate(t *testing.T) {
	newCreds := CredentialsUpdate{
		ClientID:    "newClientId",
		AccessToken: "newAccessToken",
		Certificate: `{"version":1,"scopes":["scope1"]}`,
	}

	body, err := json.Marshal(&newCreds)

	if err != nil {
		t.Fatal(err)
	}

	routes := NewRoutesTest(t)

	response := routes.request("POST", body)
	if response.Code != 405 {
		t.Errorf("Should return 405, but returned %d", response.Code)
	}

	response = routes.request("PUT", make([]byte, 0))
	if response.Code != 400 {
		t.Errorf("Should return 400, but returned %d", response.Code)
	}

	response = routes.request("PUT", []byte("{\"badJS0n!"))
	if response.Code != 400 {
		content, _ := io.ReadAll(response.Body)
		t.Fatalf("Request error %d: %s", response.Code, string(content))
	}

	response = routes.request("PUT", body)
	if response.Code != 200 {
		content, _ := io.ReadAll(response.Body)
		t.Fatalf("Request error %d: %s", response.Code, string(content))
	}

	if routes.Credentials.ClientID != newCreds.ClientID {
		t.Errorf(
			"ClientId should be \"%s\", but got \"%s\"",
			newCreds.ClientID,
			routes.Credentials.ClientID,
		)
	}

	if routes.Credentials.AccessToken != newCreds.AccessToken {
		t.Errorf(
			"AccessToken should be \"%s\", but got \"%s\"",
			newCreds.AccessToken,
			routes.Credentials.AccessToken,
		)
	}

	if routes.Credentials.Certificate != newCreds.Certificate {
		t.Errorf(
			"Certificate should be \"%s\", but got \"%s\"",
			newCreds.Certificate,
			routes.Credentials.Certificate,
		)
	}
}

func TestReadCredentialsUpdates(t *testing.T) {
	routes := NewRoutesTest(t)

	stream := `{"clientId":"first","accessToken":"firstToken","certificate":"firstCert"}
{"clientId":"second","accessToken":"secondToken","certificate":"secondCert"}
`
	if err := routes.ReadCredentialsUpdates(strings.NewReader(stream)); err != nil {
		t.Fatalf("Expected no error once the stream is closed, but got: %v", err)
	}

	// the most recent update wins
	if routes.Credentials.ClientID != "second" {
		t.Errorf("ClientId should be \"second\", but got %q", routes.Credentials.ClientID)
	}
	if routes.Credentials.AccessToken != "secondToken" {
		t.Errorf("AccessToken should be \"secondToken\", but got %q", routes.Credentials.AccessToken)
	}
	if routes.Credentials.Certificate != "secondCert" {
		t.Errorf("Certificate should be \"secondCert\", but got %q", routes.Credentials.Certificate)
	}
}

func TestReadCredentialsUpdatesStopsOnInvalidJSON(t *testing.T) {
	routes := NewRoutesTest(t)

	stream := `{"clientId":"first","accessToken":"firstToken","certificate":"firstCert"}
{"badJS0n!
{"clientId":"second","accessToken":"secondToken","certificate":"secondCert"}
`
	if err := routes.ReadCredentialsUpdates(strings.NewReader(stream)); err == nil {
		t.Fatal("Expected an error for invalid JSON")
	}

	// updates before the invalid JSON are applied, updates after it are not
	if routes.Credentials.ClientID != "first" {
		t.Errorf("ClientId should be \"first\", but got %q", routes.Credentials.ClientID)
	}
}

func TestCredentialsEndpointDisabledWithCredentialsFromStdin(t *testing.T) {
	routes := NewRoutesTest(t)
	routes.CredentialsFromStdin = true

	body, err := json.Marshal(&CredentialsUpdate{
		ClientID:    "newClientId",
		AccessToken: "newAccessToken",
	})
	if err != nil {
		t.Fatal(err)
	}

	response := routes.request("PUT", body)
	if response.Code != 404 {
		t.Errorf("Should return 404, but returned %d", response.Code)
	}
	if routes.Credentials.ClientID != "clientId" {
		t.Errorf("ClientId should be unchanged, but got %q", routes.Credentials.ClientID)
	}
}

func (routesTest *RoutesTest) request(method string, content []byte) (res *httptest.ResponseRecorder) {
	req, err := http.NewRequest(
		method,
		"http://localhost:8080/credentials",
		bytes.NewBuffer(content),
	)

	if err != nil {
		routesTest.t.Fatal(err)
	}

	req.ContentLength = int64(len(content))
	res = httptest.NewRecorder()
	routesTest.CredentialsHandler(res, req)
	return
}

func NewRoutesTest(t *testing.T) *RoutesTest {
	t.Helper()
	return &RoutesTest{
		Authenticate: true,
		Credentials: &tcclient.Credentials{
			ClientID:    "clientId",
			AccessToken: "accessToken",
			Certificate: `{"version":1,"scopes":["scope2"]}`,
		},
		t: t,
	}
}
