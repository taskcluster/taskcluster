audience: deployers
level: major 
reference: issue 3148
---
The tables in web-server are now all relational.  The migration drops all data in these tables, which will have the effect of signing out all users and requiring them to sign in again.  But it is a very quick upgrade.

Sign-ins will not work until the web-server service has been upgraded to this version (that is, sign-ins will not work during the time between the database upgrade and the services upgrade, nor if services are downgraded back to v35.0.0).

The web-server service now requires an additional environment variable `DB_CRYPTO_KEYS`
to be set which is a JSON array where each element is an object of the form.

```json
{
  "id": "a unique identifier",
  "algo": "aes-256",
  "key": "32 bytes of base64 string"
}
```

Note that for this upgrade it will only be an array of a single object.
