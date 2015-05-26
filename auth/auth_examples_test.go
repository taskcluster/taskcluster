package auth

import (
	"fmt"
	"time"
)

func Example_scopes() {

	// authenticating against production with a client ID and access token

	auth := New("hhskdjg476fau1ie1b29tQ", "3W_Lrghkjsdfn467834kgf0SRnKRiWSaKF9urnwGaX5Q")
	scopes, _ := auth.Scopes("hdjskhfb4nvrh673g4mvfd")
	fmt.Printf("Client ID: %v\n", scopes.ClientId)
	fmt.Printf("Expires:   %v\n", scopes.Expires)
	fmt.Printf("Scopes:    %v\n", scopes.Scopes)
}

func Example_modifyClient() {

	// running against a local task cluster instance with
	// authentication disabled, or e.g. a task cluster proxy
	auth := Auth{
		Authenticate: false,
		BaseURL:      "http://localhost:1234/api/AuthAPI/v1",
	}

	// let's create a new expiry time...
	location, err := time.LoadLocation("Europe/Berlin")
	if err != nil {
		panic(err)
	}

	expires, err := time.ParseInLocation(
		"Jan 2, 2006 at 3:04pm (MST)",
		"Jul 9, 2012 at 5:02am (PDT)",
		location,
	)
	if err != nil {
		panic(err)
	}

	client, callSummary := auth.ModifyClient(
		"gjhvsdfvrnbvsdvfkjhvds",
		&GetClientCredentialsResponse1{
			Description: "a nice client",
			Expires:     expires,
			Name:        "pmoore_test",
			Scopes:      []string{"*"},
		},
	)

	// panic if any errors occurred...
	if callSummary.Error != nil {
		panic(callSummary.Error)
	}

	fmt.Printf("Access Token: %v\n", client.AccessToken)
	fmt.Printf("Client Id:    %v\n", client.ClientId)
	fmt.Printf("Description:  %v\n", client.Description)
	fmt.Printf("Expires:      %v\n", client.Expires)
	fmt.Printf("Name:         %v\n", client.Name)
	fmt.Printf("Scopes:       %v\n", client.Scopes)

	// if we want, we can also show the raw json that was returned...
	fmt.Println("HTTP response payload was:")
	fmt.Println(callSummary.HttpRequestBody)
}
