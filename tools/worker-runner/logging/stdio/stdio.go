package stdio

import (
	"log"
	"os"

	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/cfg"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/logging/logging"
)

type stdioLogDestination struct {
	log *log.Logger
}

func (dst *stdioLogDestination) LogUnstructured(message string) {
	dst.log.Println(message)
}

func (dst *stdioLogDestination) LogStructured(message map[string]interface{}) {
	dst.log.Println(logging.ToUnstructured(message))
}

func New(runnercfg *cfg.RunnerConfig) logging.Logger {
	return &stdioLogDestination{log: log.New(os.Stderr, "", log.LstdFlags)}
}

func Usage() string {
	return `

The "stdio" logging logs to stderr with a timestamp prefix.  It is the default
if no logging configuration is given.  It does not take any other properties.

` + "```yaml" + `
logging:
	implementation: stdio
` + "```" + `

`

}
