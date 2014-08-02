package taskcluster

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	hawk "github.com/tent/hawk-go"
	"net/http"
)

type delegationOptions struct {
	Delegating bool     `json:"delegating"`
	Scopes     []string `json:"scopes"`
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

func Authorization(clientId string, accessToken string, http *http.Request) string {
	auth := getAuth(clientId, accessToken, http)
	return auth.RequestHeader()
}

func AuthorizationDelegate(clientId string, accessToken string, scopes []string, http *http.Request) (string, error) {
	delgating := delegationOptions{true, scopes}
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
