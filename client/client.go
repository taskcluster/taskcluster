package client

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	// "fmt"
	hawk "github.com/tent/hawk-go"
	"io"
	"net/http"
	// "net/http/httputil"
	"reflect"
)

//go:generate generatemodel -f ../model/apis.json -o generated-code.go -m model-data.txt

type (
	Auth struct {
		// Client ID required by Hawk
		ClientId string
		// Access Token required by Hawk
		AccessToken string
		// By default set to production base url for API service, but can be changed to hit a
		// different service, e.g. a staging API endpoint, or a taskcluster-proxy endpoint
		BaseURL string
		// Whether authentication is enabled (e.g. set to 'false' when using taskcluster-proxy)
		Authenticate bool
	}
)

func (auth *Auth) apiCall(payload interface{}, method, route string, result interface{}) (interface{}, *http.Response) {
	// not sure if we need to regenerate this with each call, will leave in here for now...
	credentials := &hawk.Credentials{
		ID:   auth.ClientId,
		Key:  auth.AccessToken,
		Hash: sha256.New,
	}
	jsonPayload, err := json.Marshal(payload)
	if err != nil {
		panic(err)
	}

	var ioReader io.Reader = nil
	if reflect.ValueOf(payload).IsValid() && !reflect.ValueOf(payload).IsNil() {
		ioReader = bytes.NewReader(jsonPayload)
	}
	httpRequest, err := http.NewRequest(method, auth.BaseURL+route, ioReader)
	if err != nil {
		panic(err)
	}
	reqAuth := hawk.NewRequestAuth(httpRequest, credentials, 0).RequestHeader()
	httpRequest.Header.Set("Authorization", reqAuth)
	httpClient := &http.Client{}
	response, err := httpClient.Do(httpRequest)
	// fullRequest, err := httputil.DumpRequestOut(httpRequest, true)
	// fmt.Println(string(fullRequest))
	// fullResponse, err := httputil.DumpResponse(response, true)
	// fmt.Println(string(fullResponse))
	if err != nil {
		panic(err)
	}
	defer response.Body.Close()
	// if result is nil, it means there is no response body json
	if reflect.ValueOf(result).IsValid() && !reflect.ValueOf(result).IsNil() {
		json := json.NewDecoder(response.Body)
		err = json.Decode(&result)
		if err != nil {
			panic(err)
		}
	}
	// fmt.Printf("ClientId: %v\nAccessToken: %v\nPayload: %v\nURL: %v\nMethod: %v\nResult: %v\n", auth.ClientId, auth.AccessToken, string(jsonPayload), auth.BaseURL+route, method, result)
	return result, response
}
