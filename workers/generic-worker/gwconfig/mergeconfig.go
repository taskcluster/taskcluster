package gwconfig

import (
	"encoding/json"

	"github.com/peterbourgon/mergemap"
)

// MergeInJSON merges config embedded inside a json.RawMessage into c.
//
// It does this by converting c to a map[string]interface, convering data to a
// map[string]interface and calling extract against the result to return a
// map[string]interface for its config portion, then merging the two
// map[string]interfaces together and unmarshaling back into c.
func (c *Config) MergeInJSON(data json.RawMessage, extract func(map[string]interface{}) map[string]interface{}) error {
	// This is all HORRIBLE
	// but it seems about the only reasonable way to properly merge
	// the json schemas such that json objects are recursively merged.
	// Steps: convert c to json and then back to a go type, so that
	// it is a map[string]interface{} and not a Config type. Get
	// the json bytes also into a map[string]interface{} so that
	// the two map[string]interface{} objects can be merged. Finally
	// convert the merge result to json again so that it can be
	// marshaled back into the original Config type... Yuck!
	m1 := make(map[string]interface{})
	m2 := make(map[string]interface{})
	m1bytes, err := json.Marshal(c)
	if err != nil {
		return err
	}
	err = json.Unmarshal(m1bytes, &m1)
	if err != nil {
		return err
	}
	err = json.Unmarshal(data, &m2)
	if err != nil {
		return err
	}
	merged := mergemap.Merge(m1, extract(m2))
	mergedBytes, err := json.Marshal(merged)
	if err != nil {
		return err
	}
	return json.Unmarshal(mergedBytes, c)
}
