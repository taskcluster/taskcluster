package util

import (
	"encoding/json"
	"regexp"
	"time"

	"github.com/dgrijalva/jwt-go"
)

// Logger is used by Session to write logs
type Logger interface {
	Printf(format string, a ...interface{})
	Print(a ...interface{})
}

// NilLogger implements Logger and discards all writes
type NilLogger struct{}

// Printf discards writes
func (n *NilLogger) Printf(format string, a ...interface{}) {}

// Print discards writes
func (n *NilLogger) Print(a ...interface{}) {}

// Min returns minimum of two ints
func Min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

var (
	replaceHTTPSRe = regexp.MustCompile("^(http)(s?)")
	idReplaceRe    = regexp.MustCompile("^/(\\w+)(/?)")
	jwtRe          = regexp.MustCompile("^Bearer ([\\w-\\.]+)$")
)

// ReplaceID replaces id in "/{id}/path" with "/path"
func ReplaceID(path string) string {
	return idReplaceRe.ReplaceAllString(path, "/")
}

// MakeWsURL converts http:// to ws://
func MakeWsURL(url string) string {
	return replaceHTTPSRe.ReplaceAllString(url, "ws$2")
}

func ExtractJWT(authHeader string) string {
	c := jwtRe.FindStringSubmatch(authHeader)
	if len(c) != 2 {
		return ""
	}
	return c[1]
}

func GetTokenExp(tokenString string) time.Time {
	token, err := jwt.Parse(tokenString, nil)
	if err.(*jwt.ValidationError).Errors == jwt.ValidationErrorMalformed {
		return time.Time{}
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return time.Time{}
	}

	exp, ok := claims["exp"]
	if !ok {
		return time.Time{}
	}
	switch exp.(type) {
	case float64:
		e := exp.(float64)
		return time.Unix(int64(e), 0)
	case json.Number:
		v, _ := exp.(json.Number).Int64()
		return time.Unix(v, 0)
	}
	return time.Time{}

}

// verify token is valid, and also exp and nbf on token
func IsTokenUsable(tokenString string) bool {
	token, err := jwt.Parse(tokenString, nil)
	if err.(*jwt.ValidationError).Errors == jwt.ValidationErrorMalformed {
		return false
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return false
	}

	now := time.Now().Unix()
	return claims.VerifyExpiresAt(now, true) && claims.VerifyNotBefore(now, true)
}
