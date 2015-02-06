package client

import (
	"fmt"
)

func ExampleNewAuthAPI() {
	api := NewAuthAPI("client_id_123", "access_token_456")
	fmt.Println(api.BaseURL, api.Authenticate)
	api.Authenticate = false
	api.BaseURL = "http://pretend.url.com/api/auth"
	fmt.Println(api.BaseURL, api.Authenticate)
	// Output:
	// https://auth.taskcluster.net/v1 true
	// http://pretend.url.com/api/auth false
}
