package taskcluster_test

import (
	"net/url"
	"testing"

	tc "github.com/taskcluster/taskcluster-proxy/taskcluster"
)

var urlConversions = []struct {
	rootURL  string
	given    string
	expected string
}{
	{
		"https://taskcluster.net",
		"https://xfoo.com/queue/v1/y/z",
		"https://queue.taskcluster.net/v1/y/z",
	},
	{
		"https://tc.example.com",
		"https://xfoo.com/queue/v1/y/z",
		"https://tc.example.com/api/queue/v1/y/z",
	},
	{
		"https://taskcluster.net",
		"https://xfoo.com/scheduler/v1/y/z",
		"https://scheduler.taskcluster.net/v1/y/z",
	},
	{
		"https://taskcluster.net",
		"https://xfoo.com/index/v1/y/z",
		"https://index.taskcluster.net/v1/y/z",
	},
	{
		"https://taskcluster.net",
		"https://xfoo.com/aws-provisioner/v1/y/z",
		"https://aws-provisioner.taskcluster.net/v1/y/z",
	},
	{
		"https://taskcluster.net",
		"https://xfoo.com/queue/v1/y%2fz",
		"https://queue.taskcluster.net/v1/y%2fz",
	},
	{
		"https://tc.example.com",
		"https://xfoo.com/queue/v1/y%2fz",
		"https://tc.example.com/api/queue/v1/y%2fz",
	},
	{
		"https://taskcluster.net",
		"https://xfoo.com/queue/v1/y%2fz/a",
		"https://queue.taskcluster.net/v1/y%2fz/a",
	},
	{
		"https://taskcluster.net",
		"https://xfoo.com/queue/v1/y/z?key=value",
		"https://queue.taskcluster.net/v1/y/z?key=value",
	},
	{
		"https://taskcluster.net",
		"https://xfoo.com/queue/v1/y%20/z?key=value&key2=value2",
		"https://queue.taskcluster.net/v1/y%20/z?key=value&key2=value2",
	},
	{
		"https://taskcluster.net",
		"https://xfoo.com/myqueue.somewhere.com/v1/task/tsdtwe34tgs%2ff5yh?k=v%20m",
		"https://myqueue.somewhere.com/v1/task/tsdtwe34tgs%2ff5yh?k=v%20m",
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
