package model

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	hawk "github.com/tent/hawk-go"
	"net/http"
)

type (
	Auth struct {
		// Client ID required by Hawk
		ClientId string
		// Access Token required by Hawk
		AccessToken string
	}

	// Scopes and expiration date for a client
	GetClientScopesResponse struct {
		// ClientId of the client scopes is requested about
		ClientId string
		// Date and time where the clients credentials are set to expire
		Expires string
		// List of scopes the client is authorized to access
		Scopes []string
	}
)

func (result GetClientScopesResponse) String() string {
	return fmt.Sprintf(
		"Client ID:    %v\n"+
			"Scopes:       %v\n"+
			"Expires:      %v\n",
		result.ClientId, result.Scopes, result.Expires)
}

type GetCredentialsResponse struct {
	ClientId    string
	AccessToken string
	Scopes      []string
	Expires     string
}

func issueApiCall() {
}

func (auth Auth) Scopes(clientId string) GetClientScopesResponse {
	credentials := &hawk.Credentials{
		ID:   auth.ClientId,
		Key:  auth.AccessToken,
		Hash: sha256.New,
	}
	httpRequest, err := http.NewRequest("GET", fmt.Sprintf("https://auth.taskcluster.net/v1/client/%v/scopes", auth.ClientId), nil)
	if err != nil {
		panic(err)
	}
	reqAuth := hawk.NewRequestAuth(httpRequest, credentials, 0).RequestHeader()
	httpRequest.Header.Set("Authorization", reqAuth)
	httpClient := &http.Client{}
	response, err := httpClient.Do(httpRequest)
	if err != nil {
		panic(err)
	}
	defer response.Body.Close()
	var scopes GetClientScopesResponse
	json := json.NewDecoder(response.Body)
	err = json.Decode(&scopes)
	if err != nil {
		panic(err)
	}
	return scopes
}

func (auth Auth) GetCredentials(clientId string) GetCredentialsResponse {
	return GetCredentialsResponse{}
}
