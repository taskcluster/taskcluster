package runtime

import (
	"regexp"
	"testing"
)

func TestGeneratePassword(t *testing.T) {
	format := regexp.MustCompile(`^pWd0_[A-Z2-7]{26,}$`)
	seen := map[string]bool{}
	for range 100 {
		password := GeneratePassword()
		if !format.MatchString(password) {
			t.Fatalf("password %q does not match %v", password, format)
		}
		if seen[password] {
			t.Fatalf("password %q generated twice", password)
		}
		seen[password] = true
	}
}
