audience: developers
level: minor
---

Added `QUERY_WILDCARD` symbol to APIBuilder for dynamic query string validation. This enables:

- Validation of arbitrary query parameters using a single pattern
- Mixed validation of both specific and wildcard query parameters
- Support for endpoints that accept dynamic or user-defined query parameters

Example usage:
```javascript
builder.declare({
  query: {
    [QUERY_WILDCARD]: /^[\w-]+$/,     // Pattern for any unspecified query parameter
    specificParam: /^specific-value$/ // Pattern for a specific parameter
  }
});
```

When function is passed, it allows to validate query argument name as well:
```javascript
builder.declare({
  query: {
    [QUERY_WILDCARD]: (value, key) => key.startsWith('x-'), // Allow only query parameters starting with 'x-'
  }
});
```
