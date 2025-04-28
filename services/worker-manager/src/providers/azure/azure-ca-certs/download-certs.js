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

  console.log(`Downloading certificate from ${url}`);
  execSync(`curl -s "${url}" -o "${tempFilename}"`);

  console.log(`Converting ${tempFilename} to PEM format`);
  execSync(`openssl x509 -inform DER -in "${tempFilename}" -out "${filename}"`);

  const expiryDate = execSync(`openssl x509 -noout -enddate -in "${filename}"`).toString().trim().replace('notAfter=', '');
  console.log(`Certificate ${filename} expires on ${expiryDate}`);

  output.push({ filename, url, expiryDate });

  fs.unlinkSync(tempFilename);
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
