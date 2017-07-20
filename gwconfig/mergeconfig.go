package gwconfig

import (
	"encoding/json"

	"github.com/peterbourgon/mergemap"
)

func (c *Config) MergeInJSON(data []byte) error {
	// This is all HORRIBLE
	// but it seems about the only reasonable way to properly merge
	// the json schemas such that json objects are recursively merged.
	// Steps: convert c to json and then back to a go type, so that
	// it is a map[string]interface{} and not a Config type. Get
	// the json bytes also into a map[string]interface{} so that
	// the two map[string]interface{} objects can be merged. Finally
	// convert the merge result to json again so that it can be
	// marshaled back into the original Config type... Yuck!
	m1 := new(map[string]interface{})
	m2 := new(map[string]interface{})
	m1bytes, err := json.Marshal(c)
	if err != nil {
		return err
	}
	err = json.Unmarshal(m1bytes, m1)
	if err != nil {
		return err
	}
	err = json.Unmarshal(data, m2)
	if err != nil {
		return err
	}
	merged := mergemap.Merge(*m1, *m2)
	mergedBytes, err := json.Marshal(merged)
	if err != nil {
		return err
	}
	return json.Unmarshal(mergedBytes, c)
}
