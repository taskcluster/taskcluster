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

func getAuth(clientId string, accessToken string, http *http.Request) *hawk.Auth {
	// Create the hawk authentication string from the request...
	credentials := &hawk.Credentials{
		ID:   clientId,
		Key:  accessToken,
		Hash: sha256.New,
	}
	return hawk.NewRequestAuth(http, credentials, 0)
}

func Bewit(clientId string, accessToken string, uri string) (string, error) {
	credentials := &hawk.Credentials{
		ID:   clientId,
		Key:  accessToken,
		Hash: sha256.New,
	}

	auth, err := hawk.NewURLAuth(uri, credentials, BEWIT_EXPIRES)
	if err != nil {
		return "", err
	}

	bewit := auth.Bewit()
	return fmt.Sprintf("%s?bewit=%s", uri, bewit), nil
}

func Authorization(clientId string, accessToken string, http *http.Request) string {
	auth := getAuth(clientId, accessToken, http)
	return auth.RequestHeader()
}

func AuthorizationDelegate(clientId string, accessToken string, scopes []string, http *http.Request) (string, error) {
	delgating := delegationOptions{scopes}
	delgatingJson, err := json.Marshal(delgating)
	if err != nil {
		return "", err
	}

	delgatingJsonBase64 := base64.StdEncoding.EncodeToString(delgatingJson)
	if err != nil {
		return "", err
	}

	auth := getAuth(clientId, accessToken, http)
	auth.Ext = delgatingJsonBase64
	return auth.RequestHeader(), nil
}
