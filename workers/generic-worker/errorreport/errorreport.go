package errorreport

import (
	"github.com/taskcluster/taskcluster/v30/internal/workerproto"
)

func Send(proto *workerproto.Protocol, err error, debugInfo map[string]string) {
	title := "generic-worker error"
	description := err.Error()
	// could support differentiating for panics
	kind := "error"
	// convert debugInfo from map[string]string to map[string]interface{}
	extra := map[string]interface{}{}
	for k, v := range debugInfo {
		extra[k] = v
	}
	if proto.Capable("error-report") {
		proto.Send(workerproto.Message{
			Type: "error-report",
			Properties: map[string]interface{}{
				"description": description,
				"kind":        kind,
				"title":       title,
				"extra":       extra,
			},
		})
	}
}
