package taskcluster_test

import (
	"net/url"
	"testing"

	tc "github.com/lightsofapollo/taskcluster-proxy/taskcluster"
)

var urlConversions = []struct {
	given    string
	expected string
}{
	{
		"https://xfoo.com/queue/x/y/z",
		"https://queue.taskcluster.net/x/y/z",
	},
	{
		"https://xfoo.com/scheduler/x/y/z",
		"https://scheduler.taskcluster.net/x/y/z",
	},
	{
		"https://xfoo.com/index/x/y/z",
		"https://index.taskcluster.net/x/y/z",
	},
	{
		"https://xfoo.com/aws-provisioner/x/y/z",
		"https://aws-provisioner.taskcluster.net/x/y/z",
	},
}

func TestConvertPathForQueue(t *testing.T) {
	services := tc.NewServices()

	for _, test := range urlConversions {
		expected, _ := url.Parse(test.expected)
		given, _ := url.Parse(test.given)

		realEndpoint, err := services.ConvertPath(given)

		if err != nil {
			t.Errorf("Conversion must be a success")
		}

		if expected.String() != realEndpoint.String() {
			t.Errorf("Failed conversion %s expected to be %s", expected, realEndpoint)
		}
	}
}
