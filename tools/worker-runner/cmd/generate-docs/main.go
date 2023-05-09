package main

import (
	"fmt"
	"os"

	"github.com/docopt/docopt-go"
	"github.com/taskcluster/taskcluster/v50/internal"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/logging"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/provider"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/runner"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/worker"
)

const genDocsUsage = `Generate documentation snippets for inclusion in Taskcluster docs.
This is used by 'yarn generate'.

Usage:
  generate-docs runner-config
  generate-docs providers
  generate-docs workers
  generate-docs logging
`

func main() {
	opts, _ := docopt.ParseArgs(genDocsUsage, os.Args[1:], "generate-docs "+internal.Version)

	if opts["runner-config"].(bool) {
		fmt.Printf("%s", runner.Usage())
	} else if opts["providers"].(bool) {
		fmt.Printf("%s", provider.Usage())
	} else if opts["workers"].(bool) {
		fmt.Printf("%s", worker.Usage())
	} else if opts["logging"].(bool) {
		fmt.Printf("%s", logging.Usage())
	}
}
