package personakb

import (
	"bytes"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"howett.net/plist"
)

const (
	guidA = "0A0DBF06-DEE9-43F8-8FEC-DB32E8A8662E"
	guidB = "80A575A5-1A51-4BDC-B4F2-35D05ED42F21"
	guidC = "EFFD6F5B-30C0-4B20-B0F1-F4286A7F30F3"
	guidD = "E422EAD8-B9D9-48E1-93DB-C04C7ACE325F"
)

func marshal(tb testing.TB, v any) []byte {
	tb.Helper()
	b, err := plist.Marshal(v, plist.BinaryFormat)
	if err != nil {
		tb.Fatal(err)
	}
	return b
}

func personaList(odUUID string) []any {
	return []any{
		map[string]any{
			"UserPersonaID":              uint64(501),
			"UserPersonaNickName":        "Personal",
			"UserPersonaObserverService": []any{"com.apple.searchd.personaobserver"},
			"UserPersonaType":            uint64(0),
			"UserPersonaUniqueString":    "FEEDEEEE-DDDD-CCCC-BBBB-00000000065B",
			"UserPersonaUserODUUID":      odUUID,
			"UserPersonaUserUID":         uint64(1627),
		},
		map[string]any{
			"UserPersonaID":           uint64(199),
			"UserPersonaNickName":     "Default",
			"UserPersonaType":         uint64(5),
			"UserPersonaUniqueString": "DA4A8CC6-3BB3-47A0-B787-DEEF467320FD",
		},
		map[string]any{
			"UserPersonaBundleIDS":    []any{"com.apple.mobilenotes"},
			"UserPersonaID":           uint64(99),
			"UserPersonaNickName":     "System",
			"UserPersonaType":         uint64(3),
			"UserPersonaUniqueString": "4FA2EA6E-49DE-4758-B8B5-98B95F00A312",
		},
		map[string]any{
			"UserPersonaBundleIDS": []any{"com.apple.mobilecal"},
			"UserPersonaNickName":  "Universal",
			"UserPersonaType":      uint64(4),
		},
	}
}

func recordFromPersonas(tb testing.TB, numEnt any, personas any) []byte {
	tb.Helper()
	return marshal(tb, map[string]any{
		"NUMENT": numEnt,
		"BLOB":   marshal(tb, personas),
	})
}

func record(tb testing.TB, guid string) []byte {
	tb.Helper()
	return recordFromPersonas(tb, uint64(4), personaList(guid))
}

func topLevel(tb testing.TB, asidGUIDs []string, guids ...string) map[string]any {
	tb.Helper()
	records := map[string]any{}
	for _, g := range guids {
		records[g] = record(tb, g)
	}
	asid := map[string]any{}
	for i, g := range asidGUIDs {
		asid[g] = uint64(100002 + i)
	}
	return map[string]any{
		"UsePersonaManifestVersion": uint64(1),
		"UsePersonaGenerationID":    uint64(2206),
		"UserASIDToPersonaMapping":  marshal(tb, asid),
		"UserPersonaDictionary":     records,
	}
}

func decodeTop(t *testing.T, data []byte) map[string]any {
	t.Helper()
	var top map[string]any
	format, err := plist.Unmarshal(data, &top)
	if err != nil {
		t.Fatal(err)
	}
	if format != plist.BinaryFormat {
		t.Fatalf("output format %v, want binary", plist.FormatNames[format])
	}
	return top
}

func set(guids ...string) map[string]bool {
	s := map[string]bool{}
	for _, g := range guids {
		s[g] = true
	}
	return s
}

func TestPruneRemovesStaleRecords(t *testing.T) {
	in := topLevel(t, nil, guidA, guidB, guidC)
	data := marshal(t, in)
	pruned, removed, err := Prune(data, set(guidA, guidD))
	if err != nil {
		t.Fatal(err)
	}
	if removed != 2 {
		t.Fatalf("removed %v, want 2", removed)
	}
	records := decodeTop(t, pruned)["UserPersonaDictionary"].(map[string]any)
	if len(records) != 1 {
		t.Fatalf("kept %v records, want 1", len(records))
	}
	want := in["UserPersonaDictionary"].(map[string]any)[guidA].([]byte)
	if !bytes.Equal(records[guidA].([]byte), want) {
		t.Fatal("kept record bytes changed")
	}
}

func TestPruneKeepsASIDMappedRecords(t *testing.T) {
	data := marshal(t, topLevel(t, []string{strings.ToLower(guidB)}, guidA, guidB, guidC))
	pruned, removed, err := Prune(data, set(guidA))
	if err != nil {
		t.Fatal(err)
	}
	if removed != 1 {
		t.Fatalf("removed %v, want 1", removed)
	}
	records := decodeTop(t, pruned)["UserPersonaDictionary"].(map[string]any)
	if _, ok := records[guidB]; !ok {
		t.Fatal("ASID-mapped record was removed")
	}
	if _, ok := records[guidC]; ok {
		t.Fatal("stale record was kept")
	}
}

func TestPrunePreservesOtherTopLevelValues(t *testing.T) {
	in := topLevel(t, []string{guidA}, guidA, guidB)
	in["SomeUnknownInteger"] = int64(-7)
	in["SomeUnknownData"] = []byte{1, 2, 3}
	in["SomeUnknownDict"] = map[string]any{"x": "y", "n": uint64(3)}
	data := marshal(t, in)
	pruned, removed, err := Prune(data, set(guidA))
	if err != nil {
		t.Fatal(err)
	}
	if removed != 1 {
		t.Fatalf("removed %v, want 1", removed)
	}
	before := decodeTop(t, data)
	after := decodeTop(t, pruned)
	if len(after) != len(before) {
		t.Fatalf("top-level keys %v, want %v", len(after), len(before))
	}
	for k, v := range before {
		if k == "UserPersonaDictionary" {
			continue
		}
		if !reflect.DeepEqual(after[k], v) {
			t.Errorf("top-level %q = %#v, want %#v", k, after[k], v)
		}
	}
	for _, k := range []string{"UsePersonaManifestVersion", "UsePersonaGenerationID", "SomeUnknownInteger"} {
		switch after[k].(type) {
		case int64, uint64:
		default:
			t.Errorf("top-level %q has type %T, want integer", k, after[k])
		}
	}
	if after["UsePersonaGenerationID"] != uint64(2206) {
		t.Errorf("UsePersonaGenerationID = %v, want 2206", after["UsePersonaGenerationID"])
	}
}

func TestPruneNothingToRemove(t *testing.T) {
	data := marshal(t, topLevel(t, nil, guidA, guidB))
	pruned, removed, err := Prune(data, set(guidA, guidB, guidC))
	if err != nil {
		t.Fatal(err)
	}
	if removed != 0 {
		t.Fatalf("removed %v, want 0", removed)
	}
	if !bytes.Equal(pruned, data) {
		t.Fatal("data changed although nothing was removed")
	}
}

func TestPruneIdempotent(t *testing.T) {
	data := marshal(t, topLevel(t, []string{guidC}, guidA, guidB, guidC))
	pruned, removed, err := Prune(data, set(guidA))
	if err != nil {
		t.Fatal(err)
	}
	if removed != 1 {
		t.Fatalf("removed %v, want 1", removed)
	}
	_, removed, err = Prune(pruned, set(guidA))
	if err != nil {
		t.Fatal(err)
	}
	if removed != 0 {
		t.Fatalf("second prune removed %v, want 0", removed)
	}
}

func TestPruneLowercaseLiveGUIDs(t *testing.T) {
	data := marshal(t, topLevel(t, nil, guidA, guidB))
	pruned, removed, err := Prune(data, set(strings.ToLower(guidA)))
	if err != nil {
		t.Fatal(err)
	}
	if removed != 1 {
		t.Fatalf("removed %v, want 1", removed)
	}
	records := decodeTop(t, pruned)["UserPersonaDictionary"].(map[string]any)
	if _, ok := records[guidA]; !ok {
		t.Fatal("live record was removed")
	}
}

func TestPruneErrors(t *testing.T) {
	personal := personaList(guidA)[0].(map[string]any)
	setTop := func(key string, value any) func(map[string]any) {
		return func(top map[string]any) { top[key] = value }
	}
	deleteTop := func(key string) func(map[string]any) {
		return func(top map[string]any) { delete(top, key) }
	}
	setRecord := func(key string, value any) func(map[string]any) {
		return func(top map[string]any) { top["UserPersonaDictionary"].(map[string]any)[key] = value }
	}
	tests := []struct {
		name   string
		modify func(top map[string]any)
	}{
		{"version 2", setTop("UsePersonaManifestVersion", uint64(2))},
		{"version missing", deleteTop("UsePersonaManifestVersion")},
		{"version negative", setTop("UsePersonaManifestVersion", int64(-1))},
		{"version wrong type", setTop("UsePersonaManifestVersion", []byte{1})},
		{"top-level string", setTop("Other", "x")},
		{"top-level array", setTop("Other", []any{uint64(1)})},
		{"dictionary missing", deleteTop("UserPersonaDictionary")},
		{"dictionary not a dictionary", setTop("UserPersonaDictionary", []byte{})},
		{"ASID mapping not data", setTop("UserASIDToPersonaMapping", uint64(1))},
		{"ASID mapping not a plist", setTop("UserASIDToPersonaMapping", []byte("garbage"))},
		{"record not data", setRecord(guidA, map[string]any{})},
		{"record not a plist", setRecord(guidA, []byte("garbage"))},
		{"record key not a UUID", setRecord("not-a-uuid", record(t, "not-a-uuid"))},
		{"duplicate record key", setRecord(strings.ToLower(guidA), record(t, guidA))},
		{"NUMENT missing", setRecord(guidA, marshal(t, map[string]any{"BLOB": marshal(t, personaList(guidA))}))},
		{"NUMENT not integer", setRecord(guidA, recordFromPersonas(t, "4", personaList(guidA)))},
		{"BLOB missing", setRecord(guidA, marshal(t, map[string]any{"NUMENT": uint64(4)}))},
		{"extra record key", setRecord(guidA, marshal(t, map[string]any{"NUMENT": uint64(4), "BLOB": marshal(t, personaList(guidA)), "X": uint64(1)}))},
		{"BLOB not an array", setRecord(guidA, recordFromPersonas(t, uint64(1), personal))},
		{"NUMENT mismatch", setRecord(guidA, recordFromPersonas(t, uint64(3), personaList(guidA)))},
		{"persona not a dictionary", setRecord(guidA, recordFromPersonas(t, uint64(2), []any{personal, "x"}))},
		{"persona without type", setRecord(guidA, recordFromPersonas(t, uint64(2), []any{personal, map[string]any{"UserPersonaID": uint64(1)}}))},
		{"no personal persona", setRecord(guidA, recordFromPersonas(t, uint64(3), personaList(guidA)[1:]))},
		{"two personal personas", setRecord(guidA, recordFromPersonas(t, uint64(5), append(personaList(guidA), personal)))},
		{"personal persona for other user", setRecord(guidA, record(t, guidB))},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			top := topLevel(t, nil, guidA, guidB)
			tc.modify(top)
			_, removed, err := Prune(marshal(t, top), set(guidA))
			if err == nil {
				t.Fatal("expected error")
			}
			if removed != 0 {
				t.Fatalf("removed %v, want 0", removed)
			}
		})
	}
}

func TestPruneRejectsNonBinaryInput(t *testing.T) {
	data, err := plist.Marshal(topLevel(t, nil, guidA, guidB), plist.XMLFormat)
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := Prune(data, set(guidA)); err == nil {
		t.Fatal("expected error")
	}
}

func TestPruneRejectsEmptyLiveSet(t *testing.T) {
	data := marshal(t, topLevel(t, nil, guidA, guidB))
	for _, live := range []map[string]bool{nil, {}, {guidA: false}} {
		if _, _, err := Prune(data, live); err == nil {
			t.Fatalf("expected error for live set %v", live)
		}
	}
}

func TestParseDSCLGeneratedUIDs(t *testing.T) {
	out := "_amavisd                 FFFFEEEE-DDDD-CCCC-BBBB-AAAA00000053\n" +
		"nouuid\n" +
		"   \n" +
		"task_1                   " + strings.ToLower(guidA) + "\n" +
		"\n"
	got, err := ParseDSCLGeneratedUIDs(out)
	if err != nil {
		t.Fatal(err)
	}
	want := set("FFFFEEEE-DDDD-CCCC-BBBB-AAAA00000053", guidA)
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func TestParseDSCLGeneratedUIDsErrors(t *testing.T) {
	for name, out := range map[string]string{
		"empty":             "",
		"only no-uuid":      "a\nb\n",
		"not a UUID":        "a " + guidA + "\nb not-a-uuid\n",
		"duplicate":         "a " + guidA + "\nb " + strings.ToLower(guidA) + "\n",
		"too many fields":   "a " + guidA + " extra\n",
		"UUID without name": "a " + guidA + "\n" + guidB + "\n",
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := ParseDSCLGeneratedUIDs(out); err == nil {
				t.Fatal("expected error")
			}
		})
	}
}

func TestParseDSCLReadGeneratedUID(t *testing.T) {
	for _, out := range []string{
		"GeneratedUID: " + strings.ToLower(guidA) + "\n",
		"GeneratedUID:\n " + guidA + "\n",
	} {
		got, err := ParseDSCLReadGeneratedUID(out)
		if err != nil {
			t.Fatal(err)
		}
		if got != guidA {
			t.Fatalf("got %v, want %v", got, guidA)
		}
	}
	for _, out := range []string{
		"",
		"No such key: GeneratedUID\n",
		"GeneratedUID: not-a-uuid\n",
		"GeneratedUID: " + guidA + " " + guidB + "\n",
		"Other: " + guidA + "\n",
	} {
		if _, err := ParseDSCLReadGeneratedUID(out); err == nil {
			t.Fatalf("expected error for %q", out)
		}
	}
}

func TestRequireGUIDs(t *testing.T) {
	live := set(guidA, guidB)
	if err := RequireGUIDs(live, guidA, strings.ToLower(guidB)); err != nil {
		t.Fatal(err)
	}
	if err := RequireGUIDs(live, guidA, guidC); err == nil {
		t.Fatal("expected error")
	}
}

func writeKB(t *testing.T, data []byte, mode os.FileMode) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "persona.kb")
	if err := os.WriteFile(path, data, mode); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(path, mode); err != nil {
		t.Fatal(err)
	}
	return path
}

func assertOnlyFile(t *testing.T, path string) {
	t.Helper()
	entries, err := os.ReadDir(filepath.Dir(path))
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 || entries[0].Name() != filepath.Base(path) {
		var names []string
		for _, e := range entries {
			names = append(names, e.Name())
		}
		t.Fatalf("directory contains %v, want only %v", names, filepath.Base(path))
	}
}

func TestPruneFileMissing(t *testing.T) {
	removed, err := PruneFile(filepath.Join(t.TempDir(), "persona.kb"), set(guidA), 0)
	if err != nil || removed != 0 {
		t.Fatalf("got %v, %v; want 0, nil", removed, err)
	}
}

func TestPruneFileBelowMinRecords(t *testing.T) {
	data := marshal(t, topLevel(t, nil, guidA, guidB, guidC))
	path := writeKB(t, data, 0644)
	removed, err := PruneFile(path, set(guidA), 4)
	if err != nil || removed != 0 {
		t.Fatalf("got %v, %v; want 0, nil", removed, err)
	}
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, data) {
		t.Fatal("file changed")
	}
}

func recordCount(t *testing.T, data []byte) int {
	t.Helper()
	_, records, err := decode(data)
	if err != nil {
		t.Fatal(err)
	}
	return len(records)
}

func readBytes(t *testing.T, path string) []byte {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func TestPruneFile(t *testing.T) {
	data := marshal(t, topLevel(t, nil, guidA, guidB, guidC))
	path := writeKB(t, data, 0640)
	removed, err := PruneFile(path, set(guidA), 3)
	if err != nil {
		t.Fatal(err)
	}
	if removed != 2 {
		t.Fatalf("removed %v, want 2", removed)
	}
	if n := recordCount(t, readBytes(t, path)); n != 1 {
		t.Fatalf("record count %v, want 1", n)
	}
	fi, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if fi.Mode().Perm() != 0640 {
		t.Fatalf("mode %v, want 0640", fi.Mode().Perm())
	}
	assertOnlyFile(t, path)
}

func setHook(t *testing.T, hook func()) {
	t.Helper()
	beforeRename = hook
	t.Cleanup(func() { beforeRename = nil })
}

func assertPruneFileFails(t *testing.T, path string, want []byte) {
	t.Helper()
	removed, err := PruneFile(path, set(guidA), 0)
	if err == nil {
		t.Fatal("expected error")
	}
	if removed != 0 {
		t.Fatalf("removed %v, want 0", removed)
	}
	if want != nil && !bytes.Equal(readBytes(t, path), want) {
		t.Fatal("file was modified")
	}
}

func TestPruneFileAbortsIfChanged(t *testing.T) {
	path := writeKB(t, marshal(t, topLevel(t, nil, guidA, guidB, guidC)), 0644)
	changed := marshal(t, topLevel(t, nil, guidA, guidB, guidC, guidD))
	setHook(t, func() {
		if err := os.WriteFile(path, changed, 0644); err != nil {
			t.Error(err)
		}
	})
	assertPruneFileFails(t, path, changed)
	assertOnlyFile(t, path)
}

func TestPruneFileAbortsIfRemoved(t *testing.T) {
	path := writeKB(t, marshal(t, topLevel(t, nil, guidA, guidB, guidC)), 0644)
	setHook(t, func() {
		if err := os.Remove(path); err != nil {
			t.Error(err)
		}
	})
	assertPruneFileFails(t, path, nil)
	entries, err := os.ReadDir(filepath.Dir(path))
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("directory contains %v entries, want 0", len(entries))
	}
}

func TestPruneFileRenameFailure(t *testing.T) {
	data := marshal(t, topLevel(t, nil, guidA, guidB, guidC))
	path := writeKB(t, data, 0644)
	rename = func(string, string) error { return errors.New("rename failed") }
	t.Cleanup(func() { rename = os.Rename })
	assertPruneFileFails(t, path, data)
	assertOnlyFile(t, path)
}

func TestPruneFileRejectsNonRegularFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "persona.kb")
	if err := os.Mkdir(path, 0755); err != nil {
		t.Fatal(err)
	}
	assertPruneFileFails(t, path, nil)
}

func TestPruneFileRejectsSymlink(t *testing.T) {
	data := marshal(t, topLevel(t, nil, guidA, guidB, guidC))
	target := writeKB(t, data, 0644)
	path := filepath.Join(t.TempDir(), "persona.kb")
	if err := os.Symlink(target, path); err != nil {
		t.Fatal(err)
	}
	assertPruneFileFails(t, path, data)
	if !bytes.Equal(readBytes(t, target), data) {
		t.Fatal("symlink target was modified")
	}
}

func TestPruneFileRejectsLargeFile(t *testing.T) {
	data := marshal(t, topLevel(t, nil, guidA, guidB, guidC))
	path := writeKB(t, data, 0644)
	maxFileSize = int64(len(data) - 1)
	t.Cleanup(func() { maxFileSize = 16 << 20 })
	assertPruneFileFails(t, path, data)
	maxFileSize = int64(len(data))
	if removed, err := PruneFile(path, set(guidA), 0); err != nil || removed != 2 {
		t.Fatalf("got %v, %v; want 2, nil", removed, err)
	}
}

func TestPruneFileRemovesStaleTempFiles(t *testing.T) {
	data := marshal(t, topLevel(t, nil, guidA))
	path := writeKB(t, data, 0644)
	dir := filepath.Dir(path)
	stale := []string{".persona.kb.123", ".persona.kb.4294967295"}
	kept := []string{".persona.kb.", ".persona.kb.12a", "persona.kb.123", ".other.kb.123", ".persona.kb.123.x"}
	for _, name := range append(append([]string{}, stale...), kept...) {
		if err := os.WriteFile(filepath.Join(dir, name), []byte("x"), 0644); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.Mkdir(filepath.Join(dir, ".persona.kb.456"), 0755); err != nil {
		t.Fatal(err)
	}
	kept = append(kept, ".persona.kb.456")
	if removed, err := PruneFile(path, set(guidA), 0); err != nil || removed != 0 {
		t.Fatalf("got %v, %v; want 0, nil", removed, err)
	}
	for _, name := range stale {
		if _, err := os.Lstat(filepath.Join(dir, name)); !errors.Is(err, fs.ErrNotExist) {
			t.Errorf("stale temp file %v not removed: %v", name, err)
		}
	}
	for _, name := range kept {
		if _, err := os.Lstat(filepath.Join(dir, name)); err != nil {
			t.Errorf("%v: %v", name, err)
		}
	}
	if !bytes.Equal(readBytes(t, path), data) {
		t.Fatal("file was modified")
	}
}

func FuzzPrune(f *testing.F) {
	f.Add(marshal(f, topLevel(f, []string{guidB}, guidA, guidB, guidC, guidD)))
	f.Add(marshal(f, topLevel(f, []string{guidB}, guidA, guidB)))
	f.Add(marshal(f, topLevel(f, nil, guidA)))
	f.Add(marshal(f, topLevel(f, nil, guidD)))
	f.Add(marshal(f, map[string]any{"UsePersonaManifestVersion": uint64(1)}))
	f.Add([]byte("bplist00"))
	f.Add([]byte{})
	live := set(guidA, strings.ToLower(guidC))
	f.Fuzz(func(t *testing.T, data []byte) {
		pruned, removed, err := Prune(data, live)
		if err != nil {
			return
		}
		top, before, err := decode(data)
		if err != nil {
			t.Fatalf("Prune accepted input that does not decode: %v", err)
		}
		asid, err := asidGUIDs(top)
		if err != nil {
			t.Fatalf("Prune accepted input with invalid ASID mapping: %v", err)
		}
		keep := func(key string) bool {
			k := strings.ToUpper(key)
			return k == guidA || k == guidC || asid[k]
		}
		if removed == 0 {
			if !bytes.Equal(pruned, data) {
				t.Fatal("data changed although nothing was removed")
			}
			for key := range before {
				if !keep(key) {
					t.Fatalf("stale record %v not removed", key)
				}
			}
			return
		}
		gotTop, after, err := decode(pruned)
		if err != nil {
			t.Fatalf("pruned output does not validate: %v", err)
		}
		if len(after) != len(before)-removed {
			t.Fatalf("%v records after, %v before, %v removed", len(after), len(before), removed)
		}
		for key, value := range before {
			got, present := after[key]
			if keep(key) != present {
				t.Fatalf("record %v: kept %v, want %v", key, present, keep(key))
			}
			if present && !bytes.Equal(got.([]byte), value.([]byte)) {
				t.Fatalf("record %v changed", key)
			}
		}
		for k, v := range top {
			if k != keyPersonaDict && !reflect.DeepEqual(gotTop[k], v) {
				t.Fatalf("top-level %v changed", k)
			}
		}
		if len(gotTop) != len(top) {
			t.Fatalf("top-level key count %v, want %v", len(gotTop), len(top))
		}
	})
}
