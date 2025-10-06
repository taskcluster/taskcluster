//go:build insecure && (darwin || freebsd)

package worker

func enableTaskFeatures() string {
	return `
          enableInteractive                 Enables the Interactive feature to be used in the
                                            task payload. [default: true]`
}
