#!/usr/bin/env node

const fs = require('fs');
const tweetnacl = require('tweetnacl');

function main() {
  console.log('Generating ed25519 keypair...');
  let keypair = tweetnacl.sign.keyPair();

  fs.writeFileSync('docker-worker-ed25519.pub', new Buffer.from(keypair.publicKey).toString('base64'), function(err) {});
  return fs.writeFileSync('docker-worker-ed25519-cot-signing-key.key', new Buffer.from(keypair.secretKey).toString('base64'), function(err) {});
}

main();
