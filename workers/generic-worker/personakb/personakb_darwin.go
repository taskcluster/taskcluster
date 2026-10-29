// Package personakb removes records of deleted users from the macOS
// usermanagerd persona database (/private/var/db/keybags/persona.kb).
package personakb

import (
	"errors"
	"fmt"
	"reflect"
	"regexp"
	"sort"
	"strings"

	"howett.net/plist"
)

const (
	keyManifestVersion = "UsePersonaManifestVersion"
	keyASIDMapping     = "UserASIDToPersonaMapping"
	keyPersonaDict     = "UserPersonaDictionary"
)

var uuidPattern = regexp.MustCompile(`^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$`)

// Prune returns data with the UserPersonaDictionary records removed whose
// GeneratedUID is neither in live nor referenced by UserASIDToPersonaMapping.
// All other content is preserved. If no record would be removed, it returns
// data unchanged and removed == 0.
func Prune(data []byte, live map[string]bool) (pruned []byte, removed int, err error) {
	return prune(data, live, 0)
}

// prune is Prune, except that it removes nothing if data has fewer than
// minRecords records.
func prune(data []byte, live map[string]bool, minRecords int) (pruned []byte, removed int, err error) {
	liveSet := upperSet(live)
	if len(liveSet) == 0 {
		return nil, 0, errors.New("set of live GeneratedUIDs is empty")
	}
	top, records, err := decode(data)
	if err != nil {
		return nil, 0, err
	}
	if len(records) < minRecords {
		return data, 0, nil
	}
	asid, err := asidGUIDs(top)
	if err != nil {
		return nil, 0, err
	}
	kept := make(map[string]any, len(records))
	for key, value := range records {
		k := strings.ToUpper(key)
		if liveSet[k] || asid[k] {
			kept[key] = value
		} else {
			removed++
		}
	}
	if removed == 0 {
		return data, 0, nil
	}
	out := make(map[string]any, len(top))
	for k, v := range top {
		out[k] = v
	}
	out[keyPersonaDict] = kept
	pruned, err = plist.Marshal(out, plist.BinaryFormat)
	if err != nil {
		return nil, 0, fmt.Errorf("encoding pruned persona database: %w", err)
	}
	if err := verify(top, kept, pruned); err != nil {
		return nil, 0, fmt.Errorf("pruned persona database failed verification: %w", err)
	}
	return pruned, removed, nil
}

func decode(data []byte) (top map[string]any, records map[string]any, err error) {
	if err := unmarshalBinary(data, &top); err != nil {
		return nil, nil, fmt.Errorf("decoding persona database: %w", err)
	}
	for k, v := range top {
		switch v.(type) {
		case int64, uint64, []byte, map[string]any:
		default:
			return nil, nil, fmt.Errorf("persona database key %q has unexpected type %T", k, v)
		}
	}
	if version, ok := toInt(top[keyManifestVersion]); !ok || version != 1 {
		return nil, nil, fmt.Errorf("unsupported %v %v", keyManifestVersion, top[keyManifestVersion])
	}
	records, ok := top[keyPersonaDict].(map[string]any)
	if !ok {
		return nil, nil, fmt.Errorf("%v missing or not a dictionary", keyPersonaDict)
	}
	seen := make(map[string]bool, len(records))
	for key, value := range records {
		k := strings.ToUpper(key)
		if seen[k] {
			return nil, nil, fmt.Errorf("duplicate persona record key %q", key)
		}
		seen[k] = true
		if err := validateRecord(key, value); err != nil {
			return nil, nil, fmt.Errorf("persona record %q: %w", key, err)
		}
	}
	return top, records, nil
}

func unmarshalBinary(data []byte, v any) error {
	format, err := plist.Unmarshal(data, v)
	if err != nil {
		return err
	}
	if format != plist.BinaryFormat {
		return fmt.Errorf("not a binary plist (format %v)", plist.FormatNames[format])
	}
	return nil
}

func validateRecord(key string, value any) error {
	if !uuidPattern.MatchString(key) {
		return errors.New("key is not a UUID")
	}
	raw, ok := value.([]byte)
	if !ok {
		return fmt.Errorf("value has type %T, want data", value)
	}
	var record map[string]any
	if err := unmarshalBinary(raw, &record); err != nil {
		return fmt.Errorf("decoding record: %w", err)
	}
	numEnt, ok := toInt(record["NUMENT"])
	if !ok {
		return errors.New("NUMENT missing or not an integer")
	}
	blob, ok := record["BLOB"].([]byte)
	if !ok {
		return errors.New("BLOB missing or not data")
	}
	if len(record) != 2 {
		return fmt.Errorf("record has %v keys, want 2", len(record))
	}
	var personas []any
	if err := unmarshalBinary(blob, &personas); err != nil {
		return fmt.Errorf("decoding BLOB: %w", err)
	}
	if int64(len(personas)) != numEnt {
		return fmt.Errorf("BLOB has %v personas, NUMENT is %v", len(personas), numEnt)
	}
	personal := 0
	for _, p := range personas {
		persona, ok := p.(map[string]any)
		if !ok {
			return fmt.Errorf("persona has type %T, want dictionary", p)
		}
		personaType, ok := toInt(persona["UserPersonaType"])
		if !ok {
			return errors.New("persona has no integer UserPersonaType")
		}
		if personaType != 0 {
			continue
		}
		personal++
		if odUUID, _ := persona["UserPersonaUserODUUID"].(string); !strings.EqualFold(odUUID, key) {
			return fmt.Errorf("personal persona has UserPersonaUserODUUID %q", odUUID)
		}
	}
	if personal != 1 {
		return fmt.Errorf("record has %v personal personas, want 1", personal)
	}
	return nil
}

func asidGUIDs(top map[string]any) (map[string]bool, error) {
	guids := map[string]bool{}
	value, present := top[keyASIDMapping]
	if !present {
		return guids, nil
	}
	raw, ok := value.([]byte)
	if !ok {
		return nil, fmt.Errorf("%v has type %T, want data", keyASIDMapping, value)
	}
	var mapping any
	if err := unmarshalBinary(raw, &mapping); err != nil {
		return nil, fmt.Errorf("decoding %v: %w", keyASIDMapping, err)
	}
	collectUUIDs(mapping, guids)
	return guids, nil
}

func collectUUIDs(v any, guids map[string]bool) {
	switch v := v.(type) {
	case string:
		if uuidPattern.MatchString(v) {
			guids[strings.ToUpper(v)] = true
		}
	case []any:
		for _, e := range v {
			collectUUIDs(e, guids)
		}
	case map[string]any:
		for k, e := range v {
			collectUUIDs(k, guids)
			collectUUIDs(e, guids)
		}
	}
}

func verify(top, kept map[string]any, pruned []byte) error {
	var got map[string]any
	if err := unmarshalBinary(pruned, &got); err != nil {
		return err
	}
	if len(got) != len(top) {
		return fmt.Errorf("top-level key count %v, want %v", len(got), len(top))
	}
	for k, v := range top {
		if k == keyPersonaDict {
			continue
		}
		if !reflect.DeepEqual(got[k], v) {
			return fmt.Errorf("top-level value %q changed", k)
		}
	}
	records, ok := got[keyPersonaDict].(map[string]any)
	if !ok {
		return fmt.Errorf("%v missing or not a dictionary", keyPersonaDict)
	}
	if !reflect.DeepEqual(sortedKeys(records), sortedKeys(kept)) {
		return errors.New("kept record keys differ from expected")
	}
	for k, v := range kept {
		if !reflect.DeepEqual(records[k], v) {
			return fmt.Errorf("record %q changed", k)
		}
	}
	return nil
}

func sortedKeys(m map[string]any) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

func toInt(v any) (int64, bool) {
	switch v := v.(type) {
	case int64:
		return v, true
	case uint64:
		if v > 1<<63-1 {
			return 0, false
		}
		return int64(v), true
	}
	return 0, false
}

func upperSet(in map[string]bool) map[string]bool {
	out := make(map[string]bool, len(in))
	for k, v := range in {
		if v {
			out[strings.ToUpper(k)] = true
		}
	}
	return out
}

// ParseDSCLGeneratedUIDs parses the output of
// `dscl . -list /Users GeneratedUID` into a set of upper-case GeneratedUIDs.
// Users without a GeneratedUID are skipped.
func ParseDSCLGeneratedUIDs(out string) (map[string]bool, error) {
	guids := map[string]bool{}
	for i, line := range strings.Split(out, "\n") {
		fields := strings.Fields(line)
		switch len(fields) {
		case 0:
			continue
		case 1:
			if uuidPattern.MatchString(fields[0]) {
				return nil, fmt.Errorf("line %v: GeneratedUID %q without user name", i+1, fields[0])
			}
		case 2:
			if !uuidPattern.MatchString(fields[1]) {
				return nil, fmt.Errorf("line %v: %q is not a UUID", i+1, fields[1])
			}
			guid := strings.ToUpper(fields[1])
			if guids[guid] {
				return nil, fmt.Errorf("line %v: duplicate GeneratedUID %v", i+1, guid)
			}
			guids[guid] = true
		default:
			return nil, fmt.Errorf("line %v: unexpected format %q", i+1, line)
		}
	}
	if len(guids) == 0 {
		return nil, errors.New("no GeneratedUIDs found")
	}
	return guids, nil
}

// ParseDSCLReadGeneratedUID parses the output of
// `dscl . -read /Users/<name> GeneratedUID` and returns the upper-case
// GeneratedUID.
func ParseDSCLReadGeneratedUID(out string) (string, error) {
	fields := strings.Fields(out)
	if len(fields) != 2 || fields[0] != "GeneratedUID:" || !uuidPattern.MatchString(fields[1]) {
		return "", fmt.Errorf("unexpected dscl output %q", out)
	}
	return strings.ToUpper(fields[1]), nil
}

// RequireGUIDs returns an error if any of required is not in live.
func RequireGUIDs(live map[string]bool, required ...string) error {
	liveSet := upperSet(live)
	var missing []string
	for _, guid := range required {
		if !liveSet[strings.ToUpper(guid)] {
			missing = append(missing, guid)
		}
	}
	if len(missing) > 0 {
		return fmt.Errorf("required GeneratedUIDs missing from user list: %v", strings.Join(missing, ", "))
	}
	return nil
}
