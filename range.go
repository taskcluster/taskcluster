package main

import (
	"fmt"
	"math"
	"net/http"
	"strconv"
	s "strings"
)

const BYTE_PREFIX = "bytes="
const MAX_RANGE = math.MaxInt64

type position int

// Position Enum
const (
	positionStart = iota
	positionStop
)

type Range struct {
	Start, Stop int64
}

func parseSegment(segment string, pos position) (int64, error) {
	if segment == "" {
		if pos == positionStart {
			return 0, nil
		} else {
			return MAX_RANGE, nil
		}
	}

	offset, err := strconv.Atoi(segment)
	return int64(offset), err
}

// Parse range data directly from headers, not that while byte ranges are
// inclusive go does not handle ranges in a friendly way so all ending ranges
// (except the maximum value) are +1 to conform to specs while still being easy
// to reason about using buffer slices.
func ParseRange(headers http.Header) (Range, error) {
	rng := headers.Get("Range")

	// Handle no range header case...
	if rng == "" {
		return Range{0, MAX_RANGE}, nil
	}

	// invalid range header
	if !s.HasPrefix(rng, BYTE_PREFIX) {
		return Range{0, MAX_RANGE}, fmt.Errorf("Other then byte prefix given")
	}

	rngSegment := rng[len(BYTE_PREFIX):]

	if s.Contains(rngSegment, ",") {
		return Range{0, MAX_RANGE}, fmt.Errorf("Cannot handle multiple range segments...")
	}

	segments := s.Split(rngSegment, "-")
	length := len(segments)

	if length > 2 {
		return Range{0, MAX_RANGE}, fmt.Errorf("Too many range segements")
	} else if length == 2 {
		start, startErr := parseSegment(segments[0], positionStart)

		if startErr != nil {
			return Range{0, MAX_RANGE}, startErr
		}

		stop, stopErr := parseSegment(segments[1], positionStop)
		if stopErr != nil {
			return Range{0, MAX_RANGE}, stopErr
		}

		// per rfc 7233 start/stop ranges are inclusive so just add one to end so we
		// don't need to attempt strange things in our buffer counting logic.
		if stop != MAX_RANGE {
			stop++
		}

		return Range{int64(start), int64(stop)}, nil
	}

	// Fall through into errors...
	return Range{0, MAX_RANGE}, fmt.Errorf("Unknown range segements...")
}
