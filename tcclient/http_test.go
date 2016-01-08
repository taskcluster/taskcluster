package tcclient

import (
	"encoding/base64"
	"encoding/json"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/taskcluster/taskcluster-base-go/jsontest"
)

func TestExtHeaderPermAuthScopes(t *testing.T) {
	checkExtHeader(
		t,
		&Credentials{
			ClientId:         "abc",
			AccessToken:      "def",
			AuthorizedScopes: []string{"a", "b", "c"},
		},
		// base64 of `{"authorizedScopes":["a","b","c"]}`
		"eyJhdXRob3JpemVkU2NvcGVzIjpbImEiLCJiIiwiYyJdfQ==",
	)
}

func TestExtHeaderPermNilAuthScopes(t *testing.T) {
	checkExtHeader(
		t,
		&Credentials{
			ClientId:    "abc",
			AccessToken: "def",
		},
		"",
	)
}

func TestExtHeaderPermNoAuthScopes(t *testing.T) {
	checkExtHeader(
		t,
		&Credentials{
			ClientId:         "abc",
			AccessToken:      "def",
			AuthorizedScopes: []string{},
		},
		// base64 of `{"authorizedScopes":[]}`
		"eyJhdXRob3JpemVkU2NvcGVzIjpbXX0=",
	)
}

func TestExtHeaderTempAuthScopes(t *testing.T) {
	checkExtHeaderTempCreds(
		t,
		&Credentials{
			ClientId:         "abc",
			AccessToken:      "def",
			AuthorizedScopes: []string{"a", "b", "c"},
		},
	)
}

func TestExtHeaderTempNilAuthScopes(t *testing.T) {
	checkExtHeaderTempCreds(
		t,
		&Credentials{
			ClientId:    "abc",
			AccessToken: "def",
		},
	)
}

func TestExtHeaderTempNoAuthScopes(t *testing.T) {
	checkExtHeaderTempCreds(
		t,
		&Credentials{
			ClientId:         "abc",
			AccessToken:      "def",
			AuthorizedScopes: []string{},
		},
	)
}

type ExtHeaderRawCert struct {
	Certificate      json.RawMessage `json:"certificate"`
	AuthorizedScopes []string        `json:"authorizedScopes"`
}

func checkExtHeaderTempCreds(t *testing.T, permCreds *Credentials) {
	tempCredentials, err := permCreds.CreateTemporaryCredentials(time.Second*1, "d", "e", "f")
	if err != nil {
		t.Fatalf("Received error when generating temporary credentials: %s", err)
	}
	actualHeader, err := getExtHeader(tempCredentials)
	if err != nil {
		t.Fatalf("Received error when generating ext header: %s", err)
	}
	decoded, err := base64.StdEncoding.DecodeString(actualHeader)
	if err != nil {
		t.Fatalf("Received error when base64 decoding ext header: %s", err)
	}
	extHeader := new(ExtHeaderRawCert)
	err = json.Unmarshal(decoded, extHeader)
	if err != nil {
		t.Fatalf("Cannot marshal results back into ExtHeader: %s", err)
	}
	if permCreds.AuthorizedScopes == nil {
		if strings.Contains(string(decoded), "authorizedScopes") {
			t.Fatalf("Did not expected authorizedScopes to be in ext header")
		}
	} else {
		if !reflect.DeepEqual(permCreds.AuthorizedScopes, extHeader.AuthorizedScopes) {
			t.Log("Expected AuthorizedScopes in Hawk Ext header to match AuthorizedScopes in credentials, but they didn't.")
			t.Logf("Expected: %q", permCreds.AuthorizedScopes)
			t.Logf("Actual: %q", extHeader.AuthorizedScopes)
			t.Logf("Full ext header: %s", string(decoded))
			t.FailNow()
		}
	}
	jsonCorrect, formattedExpected, formattedActual, err := jsontest.JsonEqual([]byte(tempCredentials.Certificate), extHeader.Certificate)
	if err != nil {
		t.Fatalf("Exception thrown formatting json data!\n%s\n\nStruggled to format either:\n%s\n\nor:\n\n%s", err, tempCredentials.Certificate, string(extHeader.Certificate))
	}

	if !jsonCorrect {
		t.Log("Anticipated json not generated. Expected:")
		t.Logf("%s", formattedExpected)
		t.Log("Actual:")
		t.Logf("%s", formattedActual)
		t.FailNow()
	}
}

func checkExtHeader(t *testing.T, creds *Credentials, expectedHeader string) {
	actualHeader, err := getExtHeader(creds)
	if err != nil {
		t.Fatalf("Received error when generating ext header: %s", err)
	}
	if actualHeader != expectedHeader {
		t.Fatalf("Expected header %q but got %q", expectedHeader, actualHeader)
	}
}
