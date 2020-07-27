audience: deployers
level: major
reference: issue 2931
---
The `secrets_entities` table has been migrated to a relational table `secrets`. The secrets service now requires an additional environment variable `DB_CRYPTO_KEYS` to be set which is a JSON array where each element in an obejct of the form:

{
  "id": "a unique identifier",
  "algo": "aes-256",
  "key": "32 bytes of base64 string"
}
