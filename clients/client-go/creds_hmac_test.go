package tcclient

import (
	"encoding/json"
	"io/ioutil"
	"reflect"
	"testing"
	"time"
)

type TempCredsTestCase struct {
	Description       string       `json:"description"`
	PermCreds         *Credentials `json:"permCreds"`
	Seed              string       `json:"seed"`
	Start             string       `json:"start"`
	Expiry            string       `json:"expiry"`
	TempCredsName     string       `json:"tempCredsName"`
	TempCredsScopes   []string     `json:"tempCredsScopes"`
	ExpectedTempCreds *Credentials `json:"expectedTempCreds"`
}

func Test_StaticTempCreds(t *testing.T) {
	bytes, err := ioutil.ReadFile("testcases.json")
	if err != nil {
		t.Fatalf("Could not read file testcases.json so could not run tests: %s", err)
	}
	var testCases []TempCredsTestCase
	err = json.Unmarshal(bytes, &testCases)
	if err != nil {
		t.Fatalf("Could not interpret contents of file testcases.json as json so could not run tests: %s", err)
	}
	for _, testCase := range testCases {
		testCreds(t, &testCase)
	}
}

func testCreds(t *testing.T, tc *TempCredsTestCase) {
	t.Logf("Testing " + tc.Description)
	start, _ := time.Parse(time.RFC3339, tc.Start)
	expiry, _ := time.Parse(time.RFC3339, tc.Expiry)

	permCreds := tc.PermCreds
	tempCreds, err := permCreds.CreateNamedTemporaryCredentials(
		tc.TempCredsName,
		time.Hour, // arbitrary value, we update further down
		tc.TempCredsScopes...,
	)
	if err != nil {
		t.Fatalf("Could not create temp creds from permanent creds: %s", err)
	}
	cert, err := tempCreds.Cert()
	if err != nil {
		t.Fatalf("Could not parse certificate of generated temp creds: %s", err)
	}
	cert.Seed = tc.Seed
	tempCreds.AccessToken, err = generateTemporaryAccessToken(permCreds.AccessToken, cert.Seed)
	if err != nil {
		t.Fatalf("Could not generate access token for temp creds: %s", err)
	}
	cert.Start = start.UnixNano() / 1e6
	cert.Expiry = expiry.UnixNano() / 1e6
	cert.Sign(permCreds.AccessToken, tempCreds.ClientID)
	certBytes, err := json.Marshal(cert)
	if err != nil {
		t.Fatalf("Could not convert updated certificate into a string: %s", err)
	}
	tempCreds.Certificate = string(certBytes)
	expected := tc.ExpectedTempCreds
	if !reflect.DeepEqual(expected, tempCreds) {
		t.Logf("Unexpected temp creds generated")
		t.Logf("Expected:\nAccessToken: %q\nAuthorizedScopes: %q\nClientId: %q\nCertificate: %q", expected.AccessToken, expected.AuthorizedScopes, expected.ClientID, expected.Certificate)
		t.Errorf("Actual:\nAccessToken: %q\nAuthorizedScopes: %q\nClientId: %q\nCertificate: %q", tempCreds.AccessToken, tempCreds.AuthorizedScopes, tempCreds.ClientID, tempCreds.Certificate)
	}
}
