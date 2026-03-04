import assert from 'assert';
import _ from 'lodash';
import forge from 'node-forge';
import slugid from 'slugid';
import generator from 'generate-password';

// https://learn.microsoft.com/en-us/rest/api/resources/deployments/list-at-subscription-scope?view=rest-resources-2025-04-01#provisioningstate
export const ArmDeploymentProvisioningState = {
  NotSpecified: "NotSpecified",
  Accepted: "Accepted",
  Running: "Running",
  Ready: "Ready",
  Creating: "Creating",
  Created: "Created",
  Deleting: "Deleting",
  Deleted: "Deleted",
  Canceled: "Canceled",
  Failed: "Failed",
  Succeeded: "Succeeded",
  Updating: "Updating",
};

// only use alphanumeric characters for convenience
export function nicerId() {
  return (slugid.nice() + slugid.nice() + slugid.nice()).toLowerCase().replace(/[^A-Za-z0-9]/g, '');
}

// The password must be between 8-72 characters long (Linux max is 72)
// must satisfy >= 3 of password complexity requirements from the following:
//   1) Contains an uppercase character
//   2) Contains a lowercase character
//   3) Contains a numeric digit
//   4) Contains a special character
//   5) Control characters are not allowed
export function generateAdminPassword() {
  // using `strict: true` ensures we match requirements
  return generator.generate({
    length: 72,
    lowercase: true,
    uppercase: true,
    numbers: true,
    symbols: true,
    strict: true,
  });
}

export function generateAdmin() {
  // Windows admin user name cannot be more than 20 characters long, be empty,
  // end with a period(.), or contain the following characters: \\ / \" [ ] : | < > + = ; , ? * @.
  // we have to set a password, but we never want it to be used, so we throw it away
  // a legitimate user who needs access can reset the password
  return {
    adminUsername: nicerId().slice(0, 20),
    adminPassword: generateAdminPassword(),
  };
}

export function workerConfigWithSecrets(cfg) {
  assert(_.has(cfg, 'osProfile'));
  let newCfg = _.cloneDeep(cfg);
  const { adminUsername, adminPassword } = generateAdmin();
  newCfg.osProfile.adminUsername = adminUsername;
  newCfg.osProfile.adminPassword = adminPassword;
  return newCfg;
}

// Convert a Subject or Issuer Distinguished Name (DN) to a string
export function dnToString(dn) {
  return dn.attributes.map(attr => {
    return `/${attr.shortName}=${attr.value}`;
  }).join();
}

// Calculate the fingerprint of a certificate
// From https://github.com/digitalbazaar/forge/issues/596
// Fingerprint is OpenSSL format, A1:B2:C3...
export function getCertFingerprint(cert) {
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const messageDigest = forge.md.sha1.create();
  messageDigest.start();
  messageDigest.update(der);
  const fingerprint = messageDigest.digest()
    .toHex()
    .match(/.{2}/g)
    .join(':')
    .toUpperCase();
  return fingerprint;
}

// Extract the AuthorityAccessInfo.AccessDescriptions from a certificate
// See https://tools.ietf.org/html/rfc5280#section-4.2.2.1
// Return is an array of objects:
// [{
//   method: "OSCP" or "CA Issuer",
//   location: location, which may be a URL
// },...]
export function getAuthorityAccessInfo(cert) {
  // ASN.1 validator and data capture for AccessDescription items in
  // AuthorityAccessInfo extension
  const accessDescriptionValidator = {
    name: 'AccessDescription',
    tagClass: forge.asn1.Class.UNIVERSAL,
    type: forge.asn1.Type.SEQUENCE,
    constructed: true,
    value: [{
      name: 'AccessDescription.accessMethod',
      tagClass: forge.asn1.Class.UNIVERSAL,
      type: forge.asn1.Type.OID,
      constructed: false,
      capture: 'accessMethod',
    }, {
      name: 'AccessDescription.accessLocation',
      tagClass: forge.asn1.Class.CONTEXT_SPECIFIC,
      type: forge.asn1.Type.OID,
      constructed: false,
      capture: 'accessLocation',
    }],
  };
  const knownOIDs = new Map([
    ['1.3.6.1.5.5.7.48.1', 'OSCP'],
    ['1.3.6.1.5.5.7.48.2', 'CA Issuer'],
  ]);

  const authorityInfoAccessRaw = cert.getExtension('authorityInfoAccess');
  if (!authorityInfoAccessRaw) {
    throw Error("No AuthorityAccessInfo");
  }

  const authorityInfoAccess = forge.asn1.fromDer(authorityInfoAccessRaw.value);
  const accessDescriptions = [];
  authorityInfoAccess.value.forEach((accessDescription, idx) => {
    const errors = [];
    const capture = {};
    const valid = forge.asn1.validate(
      accessDescription, accessDescriptionValidator, capture, errors);
    if (!valid) {
      const err = Error(`accessDescription[${idx}] is invalid`);
      err.errors = errors;
      throw err;
    }
    const keyOID = forge.asn1.derToOid(capture.accessMethod);
    const key = knownOIDs.get(keyOID);
    if (key === undefined) {
      throw Error(`accessDescription[$(idx)] has unknown key ${keyOID}`);
    }
    accessDescriptions.push({
      method: key,
      location: capture.accessLocation,
    });
  });
  return accessDescriptions;
}

/**
 * Creates a clone of a node-forge CA certificate store.
 * The clone will have its own internal certificate map, preventing
 * modifications (like array shifts during verification) in the clone
 * from affecting the original store.
 * Note: The certificate objects themselves are shared by reference,
 * assuming they are treated as immutable by the relevant operations.
 *
 * @param {object} originalCaStore - The node-forge CA store to clone.
 * @returns {object} A new, independent CA store object.
 */
export function cloneCaStore(originalCaStore) {
  if (!originalCaStore || typeof originalCaStore.certs !== 'object') {
    throw new Error("Invalid input: Not a CA store object.");
  }

  const newCaStore = forge.pki.createCaStore();

  for (const value of Object.values(originalCaStore.certs)) {
    const certs = Array.isArray(value) ? value : [value];
    for (const cert of certs) {
      newCaStore.addCertificate(cert);
    }
  }

  return newCaStore;
}
