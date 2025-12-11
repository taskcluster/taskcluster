package taskcluster_test

import (
	"net/url"
	"testing"

	tc "github.com/taskcluster/taskcluster/v95/tools/taskcluster-proxy/taskcluster"
)

var urlConversions = []struct {
	rootURL  string
	given    string
	expected string
}{
	{
		"https://tc.example.com",
		"https://xfoo.com/queue/v1/y/z",
		"https://tc.example.com/api/queue/v1/y/z",
	},
	{
		"https://tc.example.com",
		"https://xfoo.com/aws-provisioner/v1/y/z",
		"https://tc.example.com/api/aws-provisioner/v1/y/z",
	},
	{
		"https://tc.example.com",
		"https://xfoo.com/queue/v1/y%2fz",
		"https://tc.example.com/api/queue/v1/y%2fz",
	},
}

func TestConvertPathForQueue(t *testing.T) {

	for _, test := range urlConversions {
		services := tc.NewServices(test.rootURL)
		expected, _ := url.Parse(test.expected)
		given, _ := url.Parse(test.given)

		realEndpoint, err := services.ConvertPath(given)

		if err != nil {
			t.Errorf("Conversion must be a success")
		}

		if expected.String() != realEndpoint.String() {
			t.Errorf("Failed conversion %s: got %s, expected %s", given, realEndpoint, expected)
		}
	}
}
