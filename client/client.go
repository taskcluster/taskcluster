package client

//go:generate generatemodel -f ../model/apis.json -o generated-code.go -m model-data.txt

type (
	Auth struct {
		// Client ID required by Hawk
		ClientId string
		// Access Token required by Hawk
		AccessToken string
	}
)

func apiCall() interface{} {
	return nil
}
