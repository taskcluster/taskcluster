package logging

import (
	"encoding/json"
	"fmt"
	"sort"
)

// Convert a structured message to an unstructured message in a consistent fashion.
//
// This treats `textPayload` specially as the message in the message, and includes all
// other fields after that
func ToUnstructured(message map[string]interface{}) string {
	textPayload := ""
	messageKeys := make([]string, 0, len(message))
	for k := range message {
		if k == "textPayload" {
			var ok bool
			textPayload, ok = message[k].(string)
			if ok {
				continue // don't include a string textPayload in keys
			}
		}
		messageKeys = append(messageKeys, k)
	}
	sort.Strings(messageKeys)

	var res string
	var sep string
	if textPayload != "" {
		res = textPayload
		sep = "; "
	}
	for _, k := range messageKeys {
		str, ok := message[k].(string)
		if ok {
			res = fmt.Sprintf("%s%s%s: %s", res, sep, k, str)
		} else {
			j, err := json.Marshal(message[k])
			if err != nil {
				// use %#v as a final resort when JSON fails
				res = fmt.Sprintf("%s%s%s: %#v", res, sep, k, message[k])
			} else {
				res = fmt.Sprintf("%s%s%s: %s", res, sep, k, string(j))
			}
		}
		sep = "; "
	}

	// don't ever return an empty string
	if res == "" {
		return "{}"
	}

	return res
}

// Convert an unstructured message to a structured message in a consistent fashion.
//
// This returns a value of the shape {"textPayload": <message>}
func ToStructured(message string) map[string]interface{} {
	return map[string]interface{}{"textPayload": message}
}
