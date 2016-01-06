package taskcluster

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	hawk "github.com/tent/hawk-go"
)

const BEWIT_EXPIRES = time.Hour

type delegationOptions struct {
	Scopes []string `json:"authorizedScopes"`
}

func setAuthExt(auth *hawk.Auth, certificate string) {
	if certificate != "" {
		auth.Ext = base64.StdEncoding.EncodeToString([]byte("{\"certificate\":" + certificate + "}"))
	}
}

func getAuth(clientId, accessToken, certificate string, http *http.Request) *hawk.Auth {
	// Create the hawk authentication string from the request...
	credentials := &hawk.Credentials{
		ID:   clientId,
		Key:  accessToken,
		Hash: sha256.New,
	}
	auth := hawk.NewRequestAuth(http, credentials, 0)
	setAuthExt(auth, certificate)
	return auth
}

func Bewit(clientId, accessToken, certificate, uri string) (string, error) {
	credentials := &hawk.Credentials{
		ID:   clientId,
		Key:  accessToken,
		Hash: sha256.New,
	}

	auth, err := hawk.NewURLAuth(uri, credentials, BEWIT_EXPIRES)
	if err != nil {
		return "", err
	}
	setAuthExt(auth, certificate)

	bewit := auth.Bewit()
	return fmt.Sprintf("%s?bewit=%s", uri, bewit), nil
}

func Authorization(clientId, accessToken, certificate string, http *http.Request) string {
	auth := getAuth(clientId, accessToken, certificate, http)
	return auth.RequestHeader()
}

func AuthorizationDelegate(clientId, accessToken, certificate string, scopes []string, http *http.Request) (string, error) {
	delgating := delegationOptions{scopes}
	delgatingJson, err := json.Marshal(delgating)
	if err != nil {
		return "", err
	}

	delgatingJsonBase64 := base64.StdEncoding.EncodeToString(delgatingJson)
	if err != nil {
		return "", err
	}

	auth := getAuth(clientId, accessToken, certificate, http)
	auth.Ext = delgatingJsonBase64
	return auth.RequestHeader(), nil
}
