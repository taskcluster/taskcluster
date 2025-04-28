import { execSync } from 'child_process';
import fs from 'fs';

const readmePath = './README.md';
const certsPath = './certificates.json';

const certificates = JSON.parse(fs.readFileSync(certsPath, 'utf8'));
const output = [];

certificates.forEach(({ filename, url }) => {
  if (!url) {
    console.log(`Skipping "${filename} - no download URL`);
    return;
  }

  const tempFilename = filename.replace('.pem', '.crt');

  try {
    console.log(`Downloading certificate from ${url}`);
    execSync(`curl -s "${url}" -o "${tempFilename}"`);

    let isPEM = false;
    try {
      const fileContent = fs.readFileSync(tempFilename, 'utf8');
      isPEM = fileContent.includes('-----BEGIN CERTIFICATE-----');
    } catch (e) {
      isPEM = false;
    }

    if (isPEM) {
      console.log(`Certificate ${tempFilename} is already in PEM format, copying directly`);
      fs.copyFileSync(tempFilename, filename);
    } else {
      console.log(`Converting ${tempFilename} from DER to PEM format`);
      try {
        execSync(`openssl x509 -inform DER -in "${tempFilename}" -out "${filename}"`);
      } catch (e) {
        console.log(`DER conversion failed, trying auto-detection with openssl`);
        execSync(`openssl x509 -in "${tempFilename}" -out "${filename}"`);
      }
    }

    if (!fs.existsSync(filename)) {
      throw new Error(`Failed to create PEM file ${filename}`);
    }

    const expiryDate = execSync(`openssl x509 -noout -enddate -in "${filename}"`).toString().trim().replace('notAfter=', '');
    console.log(`Certificate ${filename} expires on ${expiryDate}`);
    output.push({ filename, url, expiryDate });

    fs.unlinkSync(tempFilename);
  } catch (e) {
    console.error(`Error downloading or converting certificate ${filename} from ${url}:\n ${e.message}`);
  }
});

// Update README.md with certificates table
let readmeContent = fs.readFileSync(readmePath, 'utf8');

let certificatesTable = '<!-- CERTIFICATES -->\n';
certificatesTable += '| Certificate Filename | Expiration Date |\n';
certificatesTable += '|----------------------|-----------------|\n';

output.forEach(cert => {
  certificatesTable += `| [${cert.filename}](${cert.url}) | ${cert.expiryDate} |\n`;
});

// Replace the existing certificates section or add it at the end
if (readmeContent.includes('<!-- CERTIFICATES -->')) {
  readmeContent = readmeContent.replace(/<!-- CERTIFICATES -->[\s\S]*$/, certificatesTable);
} else {
  readmeContent += '\n\n## List of downloaded certificates\n\n' + certificatesTable;
}

fs.writeFileSync(readmePath, readmeContent);
console.log(`Updated ${readmePath} with certificates table.`);
