package tcobject

import "encoding/json"

// The subset of hashes supported by hashing{read,write}stream which are
// "accepted" as per the object service's schemas.
var ACCEPTABLE_HASHES = []string{
	"sha256",
	"sha512",
}

// marshalHashes marshals a map of hashes as returned from the hashing
// read/write seekers into JSON.
func marshalHashes(hashes map[string]string) json.RawMessage {
	if hashes == nil {
		hashes = map[string]string{}
	}
	// marshalling a (non-null) map cannot fail
	msg, _ := json.Marshal(hashes)
	return msg
}

// unmarshalHashes unmarshals a JSON message into a map of hashes.
func unmarshalHashes(msg json.RawMessage) (map[string]string, error) {
	var hashes map[string]string
	err := json.Unmarshal(msg, &hashes)
	if err != nil {
		return nil, err
	}
	return hashes, nil
}
