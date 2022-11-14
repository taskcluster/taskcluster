package artifacts

// Logger represents a target for log messages from the artifact implementation.
type Logger interface {
	// Infof formats and lots a message at the info level
	Infof(format string, a ...interface{})

	// Errorf formats and lots a message at the error level
	Errorf(format string, a ...interface{})
}
