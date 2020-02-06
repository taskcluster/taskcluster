package win32

import (
	"testing"
	"time"
)

// TestCreateAndDestroyEnvironmentBlock tests creating and destroying an
// environment block in a loop for 60s to see if we get any intermittent
// failures.
func TestCreateAndDestroyEnvironmentBlock(t *testing.T) {
	env := []string{
		"a=AAA",
		"b=1234",
	}
	accessToken, err := InteractiveUserToken(time.Second)
	if err != nil {
		t.Fatalf("Could not get interactive user token: %v", err)
	}
	runUntil := time.Now().Add(time.Second * 600)
	pass := 0
	fail := 0
	for time.Now().Before(runUntil) {
		_, err = CreateEnvironment(&env, accessToken)
		if err != nil {
			t.Logf("Problem creating environment: %v", err)
			fail += 1
		} else {
			pass += 1
		}
	}
	if fail != 0 {
		t.Fatalf("Failed to create environment block %v times (passed %v times)", fail, pass)
	}
	t.Logf("Successfully created and destroyed environment block %v times", pass)
}
