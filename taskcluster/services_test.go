package taskcluster_test

import (
	tc "github.com/lightsofapollo/taskcluster-proxy/taskcluster"
	"net/url"
	"testing"
)

var urlConversions = []struct {
	given    string
	expected string
}{
	{
		"http://xfoo.com/queue/x/y/z",
		"http://queue.taskcluster.net/x/y/z",
	},
	{
		"http://xfoo.com/scheduler/x/y/z",
		"http://scheduler.taskcluster.net/x/y/z",
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
