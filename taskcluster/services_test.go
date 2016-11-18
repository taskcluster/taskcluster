package taskcluster_test

import (
	"net/url"
	"testing"

	tc "github.com/taskcluster/taskcluster-proxy/taskcluster"
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
	{
		"https://xfoo.com/queue/x/y%2fz",
		"https://queue.taskcluster.net/x/y%2fz",
	},
	{
		"https://xfoo.com/queue/x/y%2fz/a",
		"https://queue.taskcluster.net/x/y%2fz/a",
	},
	{
		"https://xfoo.com/queue/x/y/z?key=value",
		"https://queue.taskcluster.net/x/y/z?key=value",
	},
	{
		"https://xfoo.com/myqueue.somewhere.com/v1/task/tsdtwe34tgs%2ff5yh?k=v%20m",
		"https://myqueue.somewhere.com/v1/task/tsdtwe34tgs%2ff5yh?k=v%20m",
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
