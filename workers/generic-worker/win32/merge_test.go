package win32_test

import (
	"log"
	"testing"

	"github.com/taskcluster/generic-worker/win32"
)

func TestMergeNilListsFirstNil(t *testing.T) {
	res, err := win32.MergeEnvLists(nil, &[]string{"FOO=bar"})
	if err != nil {
		log.Fatalf("Hit error: %v", err)
	}
	if res == nil || len(*res) != 1 || (*res)[0] != "FOO=bar" {
		t.Fatalf("Did not merge correctly; got %#v", res)
	}
}

func TestMergeNilListsSecondNil(t *testing.T) {
	res, err := win32.MergeEnvLists(&[]string{"FOO=bar"}, nil)
	if err != nil {
		log.Fatalf("Hit error: %v", err)
	}
	if res == nil || len(*res) != 1 || (*res)[0] != "FOO=bar" {
		t.Fatalf("Did not merge correctly; got %#v", res)
	}
}
