package root

import (
	"os"

	"github.com/sirupsen/logrus"
)

var (
	// Logger is the default log.Logger of the commands
	Logger = &logrus.Logger{
		Out:       os.Stderr,
		Formatter: new(logrus.TextFormatter),
		Hooks:     make(logrus.LevelHooks),
		Level:     logrus.InfoLevel,
	}
)

// setup log output based on --verbose flag
func setUpLogs(enable bool) {
	Logger.Formatter.(*logrus.TextFormatter).DisableTimestamp = true
	if enable {
		Logger.SetLevel(logrus.DebugLevel)
	}
}
