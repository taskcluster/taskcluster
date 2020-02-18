package main

import (
	"fmt"
	"io/ioutil"
	"strings"

	"github.com/taskcluster/taskcluster/v25/tools/taskcluster-worker-runner/provider"
	"github.com/taskcluster/taskcluster/v25/tools/taskcluster-worker-runner/runner"
	"github.com/taskcluster/taskcluster/v25/tools/taskcluster-worker-runner/worker"
)

// copy of Usage from `cmd/startworker/main.go` since go won't allow importing that
func usage() string {
	return `
This binary is configured to run at instance start up, getting a configuration
file as its argument.  It logs to its stdout.

` + "```" + `
start-worker <runnerConfig>
` + "```" + `

` + runner.Usage() + `

` + provider.Usage() + `

` + worker.Usage()
}

const prefix = "<!-- start-usage -->"
const suffix = "<!-- end-usage -->"

func main() {
	readmeBytes, err := ioutil.ReadFile("README.md")
	if err != nil {
		panic(err)
	}

	readme := string(readmeBytes)

	start := strings.Index(readme, prefix)
	if start == -1 {
		panic(fmt.Sprintf("README does not contain %s", prefix))
	}
	end := strings.Index(readme, suffix)
	if end == -1 {
		panic(fmt.Sprintf("README does not contain %s", suffix))
	}

	readme = string(readme[:start]) +
		prefix + "\n" +
		strings.ReplaceAll(strings.Trim(usage(), "\n"), "\t", "    ") + "\n" +
		string(readme[end:])

	err = ioutil.WriteFile("README.md", []byte(readme), 0644)
	if err != nil {
		panic(err)
	}
}
