package gdm3

import "testing"

func TestSetAutoLogin(t *testing.T) {
	source := []byte(`
[fred]
[mary]
[daemon]
AutomaticLogin = user4
[john]
AutomaticLoginEnable = true
AutomaticLogin = user5`)
	result := SetAutoLogin("pete", source)
	expected := []byte(`
[fred]
[mary]
[daemon]
# Set by generic-worker
AutomaticLoginEnable = true
AutomaticLogin = pete

[john]
AutomaticLoginEnable = true
AutomaticLogin = user5`)
	if string(result) != string(expected) {
		t.Logf("Expected:\n%s", expected)
		t.Fatalf("Got:\n%s", result)
	}
}
