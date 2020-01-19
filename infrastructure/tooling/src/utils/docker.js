const util = require('util');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Docker = require('dockerode');
const Observable = require('zen-observable');
const {PassThrough, Transform} = require('stream');
const taskcluster = require('taskcluster-client');
const {REPO_ROOT} = require('./repo');
const got = require('got');
const {execCommand} = require('./command');
const mkdirp = util.promisify(require('mkdirp'));
const rimraf = util.promisify(require('rimraf'));

/**
 * Set up to call docker in the given baseDir (internal use only)
 */
const _dockerSetup = ({baseDir}) => {
  const inner = async ({baseDir}) => {
    const docker = new Docker();
    // when running a docker container, always remove the container when finished,
    // mount the workdir at /workdir, and run as the current (non-container) user
    // so that file ownership remains as expected.  Set up /etc/passwd and /etc/group
    // to define names for those uid/gid, too.
    const {uid, gid} = os.userInfo();
    fs.writeFileSync(path.join(baseDir, 'passwd'),
      `root:x:0:0:root:/root:/bin/bash\nbuilder:x:${uid}:${gid}:builder:/:/bin/bash\n`);
    fs.writeFileSync(path.join(baseDir, 'group'),
      `root:x:0:\nbuilder:x:${gid}:\n`);
    const dockerRunOpts = {
      AutoRemove: true,
      User: `${uid}:${gid}`,
      Env: [
        'HOME=/base/app',
      ],
      Mounts: [{
        Type: 'bind',
        Target: '/etc/passwd',
        Source: `${baseDir}/passwd`,
        ReadOnly: true,
      }, {
        Type: 'bind',
        Target: '/etc/group',
        Source: `${baseDir}/group`,
        ReadOnly: true,
      },
      ],
    };

    return {docker, dockerRunOpts, uid, gid};
  };

  if (!(baseDir in _dockerSetup.memos)) {
    // cache the promise to return multiple times
    _dockerSetup.memos[baseDir] = inner({baseDir});
  }
  return _dockerSetup.memos[baseDir];
};
_dockerSetup.memos = {};

/**
 * Run a command (`docker run`), logging the output to TaskGraph and to a local
 * logfile
 *
 * - baseDir -- base directory for operations
 * - logfile -- name of the file to write the log to
 * - command -- command to run
 * - env -- environment variables to set
 * - workingDir -- directory to run in
 * - image -- image to run it in
 * - asRoot -- run as root
 * - utils -- taskgraph utils (waitFor, etc.)
 */
exports.dockerRun = async ({baseDir, logfile, command, env, mounts, workingDir, image, asRoot, utils}) => {
  const {docker, dockerRunOpts} = await _dockerSetup({baseDir});

  const output = new PassThrough().pipe(new DemuxDockerStream());
  let errorAddendum = '';
  if (logfile) {
    output.pipe(fs.createWriteStream(logfile));
    errorAddendum = ` Logs available in ${logfile}`;
  }

  const {Mounts, Env, ...otherOpts} = dockerRunOpts;
  const containerOpts = {
    Image: image,
    AttachStdin: false,
    AttachStdout: true,
    AttachStderr: true,
    OpenStdin: false,
    StdinOnce: false,
    Tty: false,
    Env: [...Env, ...env || []],
    WorkingDir: workingDir,
    Cmd: command,
    HostConfig: {
      Mounts: [...Mounts, ...mounts || []],
      // AutoRemove would help clean up stray containers, but means we cannot reliably
      // get the exit status of the container
      AutoRemove: false,
    },
    ...otherOpts,
  };

  if (asRoot) {
    delete containerOpts.User;
  }

  // this is roughly the equivalent of `docker run`, performed as individual
  // docker API calls.
  const container = await docker.createContainer(containerOpts);
  const stream = await container.attach({stream: true, stdout: true, stderr: true});
  stream.pipe(output, {end: true});
  await container.start({});

  // wait for the output to close, then wait for the container to exit
  await utils.waitFor(output);
  const result = await utils.waitFor(container.wait());
  await utils.waitFor(container.remove());

  if (result.StatusCode !== 0) {
    throw new Error(`Container exited with status ${result.StatusCode}.${errorAddendum}`);
  }
};

// Decode the multiplexed stream from Docker.  See
// https://docs.docker.com/engine/api/v1.37/#operation/ContainerAttach
// for protocol details.
class DemuxDockerStream extends Transform {
  constructor() {
    super();
    this.buffer = Buffer.alloc(0);
  }

  _transform(chunk, encoding, callback) {
    if (this.buffer.length) {
      this.buffer = Buffer.concat([this.buffer, chunk]);
    } else {
      this.buffer = chunk;
    }

    // The data stream is an 8-byte header: [type, 0, 0, 0, SIZE1, SIZE2,
    // SIZE3, SIZE4] followed by the payload.  We don't care about the type, so
    // just read the size and then dump the payload to the stream output.
    while (this.buffer.length >= 8) {
      const len = this.buffer.readUInt32BE(4);
      if (this.buffer.length < len + 8) {
        break;
      }
      const payload = this.buffer.slice(8, len + 8);
      this.buffer = this.buffer.slice(len + 8);
      this.push(payload);
    }
    callback();
  }
}

/**
 * Pull an image from a docker registry (`docker pull`)
 *
 * - baseDir -- base directory for operations
 * - image -- image to run it in
 * - utils -- taskgraph utils (waitFor, etc.)
 */
exports.dockerPull = async ({baseDir, image, utils}) => {
  const {docker} = await _dockerSetup({baseDir});

  utils.status({message: `docker pull ${image}`});
  const dockerStream = await new Promise(
    (resolve, reject) => docker.pull(image, (err, stream) => err ? reject(err) : resolve(stream)));

  await utils.waitFor(new Observable(observer => {
    let downloading = {}, extracting = {}, totals = {};
    docker.modem.followProgress(dockerStream,
      err => err ? observer.error(err) : observer.complete(),
      update => {
        // The format of this stream appears undocumented, but we can fake it based on observations..
        // general messages seem to lack progressDetail
        if (!update.progressDetail) {
          return;
        }

        let progressed = false;
        if (update.status === 'Waiting') {
          totals[update.id] = 104857600; // a guess: 100MB
          progressed = true;
        } else if (update.status === 'Downloading') {
          downloading[update.id] = update.progressDetail.current;
          totals[update.id] = update.progressDetail.total;
          progressed = true;
        } else if (update.status === 'Extracting') {
          extracting[update.id] = update.progressDetail.current;
          totals[update.id] = update.progressDetail.total;
          progressed = true;
        }

        if (progressed) {
          // calculate overall progress by assuming that every image must be
          // downloaded and extracted, and that those both take the same amount
          // of time per byte.
          const total = Object.values(totals).reduce((a, b) => a + b, 0) * 2;
          const current = Object.values(downloading).reduce((a, b) => a + b, 0) +
            Object.values(extracting).reduce((a, b) => a + b, 0);
          utils.status({progress: current * 100 / total});
        }
      });
  }));
};

/**
 * List locally-loaded docker images (`docker images`)
 *
 * - baseDir -- base directory for operations
 */
exports.dockerImages = async ({baseDir}) => {
  const {docker} = await _dockerSetup({baseDir});

  return docker.listImages();
};

/**
 * Check whether a tag exists on a registry
 *
 * - tag -- the tag to check for
 */
exports.dockerRegistryCheck = async ({tag}) => {
  const [repo, imagetag] = tag.split(/:/);
  try {
    // Access the registry API directly to see if this tag already exists, and do not push if so.
    const res = await got(`https://index.docker.io/v1/repositories/${repo}/tags`, {json: true});
    if (res.body && res.body.map(l => l.name).includes(imagetag)) {
      return true;
    }
  } catch (err) {
    if (err.statusCode !== 404) {
      throw err;
    }
  }

  return false;
};

/**
 * Push an image to a registry (`docker push`)
 *
 * - baseDir -- base directory for operations
 * - tag -- tag to push
 * - logfile -- name of the file to write the log to
 * - credentials -- {username, secret} for docker access
 *     (optional; uses existing docker creds if omitted)
 * - utils -- taskgraph utils (waitFor, etc.)
 */
exports.dockerPush = async ({baseDir, tag, logfile, credentials, utils}) => {
  let homeDir;
  const env = {...process.env};

  try {
    if (credentials) {
      // override HOME so this doesn't use the user's credentials
      homeDir = path.join(REPO_ROOT, 'temp', taskcluster.slugid());
      await mkdirp(homeDir);
      env.HOME = homeDir;

      // run `docker login` to set up credentials in the temp homedir
      utils.status({message: `Signing into docker hub with username ${credentials.username}`});
      await execCommand({
        dir: baseDir,
        command: ['docker', 'login', '--username', credentials.username, '--password-stdin'],
        utils,
        stdin: credentials.password,
        logfile,
        env,
      });
    }

    await execCommand({
      dir: baseDir,
      command: ['docker', 'push', tag],
      utils,
      logfile,
      env,
    });
  } finally {
    if (homeDir) {
      await rimraf(homeDir);
    }
  }
};
