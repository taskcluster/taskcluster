package tcclient

import (
	"encoding/json"
	"reflect"
	"testing"
	"time"
)

func Test_SignatureAndAccessTokenTempCreds(t *testing.T) {
	permClientId := "def/ghi@XXX"
	tempClientId := "abc/def/ghi"
	permAccessToken := "tokenABCDEFGH"
	seed := "JYR4wzMCTG6XeDS2cDUCMwH0RFUXGfQjK7LgqD-e6lSQ"
	tempScopes := []string{
		"scope/asd:fhjdf/X",
		"scope/asd:fhjdf/XYZ*",
	}
	start, _ := time.Parse(time.RFC3339, "2015-08-07T16:26:51.744Z")
	expiry, _ := time.Parse(time.RFC3339, "2015-08-08T16:26:51.744Z")

	expectedCert := "{\"version\":1,\"scopes\":[\"scope/asd:fhjdf/X\",\"scope/asd:fhjdf/XYZ*\"],\"start\":1438964811744,\"expiry\":1439051211744,\"seed\":\"JYR4wzMCTG6XeDS2cDUCMwH0RFUXGfQjK7LgqD-e6lSQ\",\"signature\":\"nNEaLtZMiw627NuDbF5Z8HDFc57MGWCptXBQSYNFgBk=\",\"issuer\":\"def/ghi@XXX\"}"
	expectedAccessToken := "R4OVHWpIvy6KsqS4AWE51QwbvgLvsstS6e6UW8IfHUY"

	permCreds := &Credentials{
		ClientId:    permClientId,
		AccessToken: permAccessToken,
	}
	tempCreds, err := permCreds.CreateNamedTemporaryCredentials(
		tempClientId,
		time.Hour,
		tempScopes...,
	)
	if err != nil {
		t.Fatalf("Could not create temp creds from permanent creds: %s", err)
	}
	cert, err := tempCreds.Cert()
	if err != nil {
		t.Fatalf("Could not parse certificate of generated temp creds: %s", err)
	}
	cert.Seed = seed
	tempCreds.AccessToken, err = generateTemporaryAccessToken(permCreds.AccessToken, cert.Seed)
	if err != nil {
		t.Fatalf("Could not generate access token for temp creds: %s", err)
	}
	cert.Start = start.UnixNano() / 1e6
	cert.Expiry = expiry.UnixNano() / 1e6
	cert.updateSignature(permCreds.AccessToken, tempCreds.ClientId)
	certBytes, err := json.Marshal(cert)
	if err != nil {
		t.Fatalf("Could not convert updated certificate into a string: %s", err)
	}
	tempCreds.Certificate = string(certBytes)
	expected := &Credentials{
		Certificate:      expectedCert,
		AccessToken:      expectedAccessToken,
		AuthorizedScopes: nil,
		ClientId:         tempCreds.ClientId,
	}
	if !reflect.DeepEqual(expected, tempCreds) {
		t.Logf("Unexpected temp creds generated")
		t.Logf("Expected:\nAccessToken: %q\nAuthorizedScopes: %q\nClientId: %q\nCertificate: %q", expected.AccessToken, expected.AuthorizedScopes, expected.ClientId, expected.Certificate)
		t.Fatalf("Actual:\nAccessToken: %q\nAuthorizedScopes: %q\nClientId: %q\nCertificate: %q", tempCreds.AccessToken, tempCreds.AuthorizedScopes, tempCreds.ClientId, tempCreds.Certificate)
	}
}
