package jsontest

import "encoding/json"

// Checks whether two json []byte are equivalent (equal) by formatting/ordering
// both of them consistently, and then comparing if formatted versions are
// identical. Returns true/false together with formatted json, and any error.
func JsonEqual(a []byte, b []byte) (bool, []byte, []byte, error) {
	a_, err := FormatJson(a)
	if err != nil {
		return false, nil, nil, err
	}
	b_, err := FormatJson(b)
	if err != nil {
		return false, a_, nil, err
	}
	return string(a_) == string(b_), a_, b_, nil
}

// Takes json []byte input, unmarshals and then marshals, in order to get a
// canonical representation of json (i.e. formatted with objects ordered).
// Ugly and perhaps inefficient, but effective! :p
func FormatJson(a []byte) ([]byte, error) {
	tmpObj := new(interface{})
	err := json.Unmarshal(a, &tmpObj)
	if err != nil {
		return a, err
	}
	return json.MarshalIndent(&tmpObj, "", "  ")
}
