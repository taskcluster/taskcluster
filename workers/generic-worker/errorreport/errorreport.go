package errorreport

import (
	"fmt"

	"github.com/taskcluster/taskcluster/v44/tools/workerproto"
)

func Send(proto *workerproto.Protocol, message interface{}, debugInfo map[string]string) {
	if !proto.Capable("error-report") {
		return
	}

	title := "generic-worker error"
	description := fmt.Sprintf("%s", message)
	// could support differentiating for panics
	kind := "worker-error"
	// convert debugInfo from map[string]string to map[string]interface{}
	extra := map[string]interface{}{}
	for k, v := range debugInfo {
		extra[k] = v
	}
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
