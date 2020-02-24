// The logging package is an internal logging abstraction, designed to handle
// both structured and unstructured data.
package logging

// A Logger handles sending log output to an appropriate place, per user
// configuration.  It must handle both structured (arbitrary JSON) and
// unstructured (plain text) inputs, and can produce whatever format is
// appropriate for the destination.
type Logger interface {
	// Log an unstructured text message (not newline-terminated)
	LogUnstructured(message string)

	// Log a structured message.
	LogStructured(message map[string]interface{})
}

var Destination Logger

func init() {
	// Destination should always be set.  It will be reset based on the runner config
	// once that config has been read, but until that time default to stdio
	Destination = NewStdioLogDestination()
}
