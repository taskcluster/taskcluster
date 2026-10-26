import { readRepoFile, readRepoJSON, writeRepoFile } from '../../utils/index.js';

const TABLE_FILE = 'taskcluster/toolchain-sha256.yml';
const FETCH_TIMEOUT_MS = 30_000;
const SHA256_RE = /^[a-f0-9]{64}$/;

const HEADER = `---
# sha256 of every toolchain archive that release tasks download, keyed by the
# exact download URL (see _TOOLCHAINS in src/release.py). generic-worker checks
# the hash before extracting the archive. This file is maintained by
# \`yarn generate\`, which fetches the official checksum for new versions of
# .go-version, package.json engines.node,
# clients/client-rust/rust-toolchain.toml and .uv-version. Hashes already
# here are never re-fetched, so fix a wrong one by deleting its line and
# regenerating. Task generation fails if a toolchain URL has no hash here.
`;

const fetchText = async url => {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return await res.text();
};

// Return the validated hash re-encoded from its bytes, so only a well-formed
// 64-character hex digest is ever written to the table.
const checkSha256 = (value, what) => {
  if (!SHA256_RE.test(value ?? '')) {
    throw new Error(`Invalid sha256 ${JSON.stringify(value)} found for ${what}`);
  }
  return Buffer.from(value, 'hex').toString('hex');
};

// Parse an X.Y.Z version and rebuild it from its numeric parts, so URLs are
// built only from validated numbers.
const parseVersion = (value, what, example) => {
  const match = /^([0-9]+)\.([0-9]+)\.([0-9]+)$/.exec(value ?? '');
  if (!match) {
    throw new Error(`invalid ${what} ${JSON.stringify(value)} (expected e.g. ${example})`);
  }
  return match
    .slice(1)
    .map(part => Number.parseInt(part, 10))
    .join('.');
};

// `<url>.sha256` files hold "<hash>  <filename>"; take the first token.
const fetchSidecarSha256 = async url => {
  const text = await fetchText(`${url}.sha256`);
  return checkSha256(text.trim().split(/\s+/)[0], url);
};

const parseTable = contents => {
  const table = new Map();
  for (const line of contents.split('\n')) {
    if (line.trim() === '' || line === '---' || line.startsWith('#')) {
      continue;
    }
    const match = line.match(/^(\S+): ([a-f0-9]{64})$/);
    if (!match) {
      throw new Error(`Cannot parse line in ${TABLE_FILE}: ${line}`);
    }
    table.set(match[1], match[2]);
  }
  return table;
};

/**
 * Read the four toolchain versions and build the download URLs.
 *
 * The URL templates must match `_TOOLCHAINS` in taskcluster/src/release.py;
 * the order here (go, rust, node, uv) is the order of the table.
 */
const readToolchains = async () => {
  const goVersion = parseVersion(
    (await readRepoFile('.go-version')).trim().replace(/^go/, ''),
    'go version in .go-version',
    'go1.27.2'
  );

  const rustMatch = (await readRepoFile('clients/client-rust/rust-toolchain.toml')).match(/^channel\s*=\s*"([^"]*)"/m);
  const rustVersion = parseVersion(rustMatch?.[1], 'rust version in clients/client-rust/rust-toolchain.toml', '1.98.0');

  const nodeVersion = parseVersion(
    (await readRepoJSON('package.json')).engines?.node,
    'node version in package.json',
    '24.21.0'
  );

  const uvVersion = parseVersion((await readRepoFile('.uv-version')).trim(), 'uv version in .uv-version', '0.13.0');

  const goFilename = `go${goVersion}.linux-amd64.tar.gz`;
  const nodeFilename = `node-v${nodeVersion}-linux-x64.tar.gz`;
  return [
    {
      name: 'go',
      url: `https://go.dev/dl/${goFilename}`,
      fetchSha256: async () => {
        const releases = JSON.parse(await fetchText('https://go.dev/dl/?mode=json&include=all'));
        for (const release of releases) {
          const file = release.files?.find(f => f.filename === goFilename);
          if (file) {
            return checkSha256(file.sha256, goFilename);
          }
        }
        throw new Error(`No sha256 for ${goFilename} found at https://go.dev/dl/?mode=json&include=all`);
      },
    },
    {
      name: 'rust',
      url: `https://static.rust-lang.org/dist/rust-${rustVersion}-x86_64-unknown-linux-gnu.tar.gz`,
    },
    {
      name: 'node',
      url: `https://nodejs.org/dist/v${nodeVersion}/${nodeFilename}`,
      fetchSha256: async () => {
        const shasums = `https://nodejs.org/dist/v${nodeVersion}/SHASUMS256.txt`;
        const line = (await fetchText(shasums)).split('\n').find(l => l.trim().endsWith(` ${nodeFilename}`));
        if (!line) {
          throw new Error(`No sha256 for ${nodeFilename} found at ${shasums}`);
        }
        return checkSha256(line.trim().split(/\s+/)[0], nodeFilename);
      },
    },
    {
      name: 'uv',
      url: `https://github.com/astral-sh/uv/releases/download/${uvVersion}/uv-x86_64-unknown-linux-gnu.tar.gz`,
    },
  ];
};

/**
 * Keep taskcluster/toolchain-sha256.yml in step with the toolchain versions:
 * existing entries are kept, missing ones are fetched from the official
 * checksum sources, and stale ones are dropped.
 */
export const tasks = [
  {
    title: 'Toolchain sha256',
    provides: ['target-toolchain-sha256'],
    run: async (_requirements, utils) => {
      const toolchains = await readToolchains();
      const existing = parseTable(await readRepoFile(TABLE_FILE));

      let body = '';
      for (const { name, url, fetchSha256 } of toolchains) {
        let sha256 = existing.get(url);
        if (sha256) {
          utils.status({ message: `${name}: ${url} already present` });
        } else {
          utils.status({ message: `${name}: fetching sha256 for ${url}` });
          sha256 = await (fetchSha256 ?? (() => fetchSidecarSha256(url)))();
        }
        body += `${url}: ${sha256}\n`;
      }

      await writeRepoFile(TABLE_FILE, HEADER + body);
    },
  },
];
