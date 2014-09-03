package main

import (
	"fmt"
	"math"
	"net/http"
	"strconv"
	s "strings"
)

const BYTE_PREFIX = "bytes="

var Inf = int64(math.Inf(0)) //positive infinity

type position int

// Position Enum
const (
	positionStart = iota
	positionStop
)

type Range struct {
	start, stop int64
}

func parseSegment(segment string, pos position) (int64, error) {
	if segment == "" {
		if pos == positionStart {
			return 0, nil
		} else {
			return Inf, nil
		}
	}

	offset, err := strconv.Atoi(segment)
	return int64(offset), err
}

func ParseRange(headers http.Header) (Range, error) {
	rng := headers.Get("Range")

	// Handle no range header case...
	if rng == "" {
		return Range{0, Inf}, nil
	}

	// invalid range header
	if !s.HasPrefix(rng, BYTE_PREFIX) {
		return Range{0, Inf}, fmt.Errorf("Other then byte prefix given")
	}

	rngSegment := rng[len(BYTE_PREFIX):]

	if s.Contains(rngSegment, ",") {
		return Range{0, Inf}, fmt.Errorf("Cannot handle multiple range segments...")
	}

	segments := s.Split(rngSegment, "-")
	length := len(segments)

	if length > 2 {
		return Range{0, Inf}, fmt.Errorf("Too many range segements")
	} else if length == 2 {
		start, startErr := parseSegment(segments[0], positionStart)

		if startErr != nil {
			return Range{0, Inf}, startErr
		}

		stop, stopErr := parseSegment(segments[1], positionStop)
		if stopErr != nil {
			return Range{0, Inf}, stopErr
		}

		return Range{int64(start), int64(stop)}, nil
	}

	// Fall through into errors...
	return Range{0, Inf}, fmt.Errorf("Unknown range segements...")
}
