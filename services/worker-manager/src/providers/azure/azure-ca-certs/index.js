import fs from 'fs';
import path from 'path';

const __dirname = new URL('.', import.meta.url).pathname;
/** @type {Array<{ filename: string, url: string }>} */
const certificates = JSON.parse(fs.readFileSync(path.join(__dirname, 'certificates.json'), 'utf8'));

export function loadCertificates() {
  const certificateContents = certificates.map(({ filename }) => {
    const certPath = path.join(__dirname, filename);
    let certificate;
    if (fs.existsSync(certPath)) {
      certificate = fs.readFileSync(certPath, 'utf8');
    } else {
      throw new Error(`Certificate file not found: ${filename}`);
    }

    return certificate;
  });

  return certificateContents;
}
