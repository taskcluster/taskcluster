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
		Level:     logrus.ErrorLevel,
	}
)

// setup log output based on --verbose flag
func setUpLogs(enable bool) {
	Logger.SetFormatter(&logrus.TextFormatter{
		TimestampFormat: "02-01-2006 15:04:05",
		FullTimestamp:   true,
	})
	if enable {
		Logger.SetLevel(logrus.DebugLevel)
	}
}
