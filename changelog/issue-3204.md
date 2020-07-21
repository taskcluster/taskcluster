audience: deployers
level: major 
reference: issue 3148
---
The tables in web-server are now all relational. The
web-server service now requires an additional environment variable `DB_CRYPTO_KEYS`
to be set which is a JSON array where each element is an object of the form.

```json
{
  "id": "a unique identifier",
  "algo": "aes-256",
  "key": "32 bytes of base64 string"
}
```

Note that for this upgrade it will only be an array of a single object.
