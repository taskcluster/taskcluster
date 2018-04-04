const _ = require('lodash');
const git = require('simple-git/promise');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Docker = require('dockerode');
const Observable = require('zen-observable');
const {PassThrough} = require('stream');
const got = require('got');
const {spawn} = require('child_process'); 

/**
 * Determine if the given directory is stamped with the given sources.
 */
exports.dirStamped = ({dir, sources}) => {
  if (!fs.existsSync(dir)) {
    return false;
  }

  const sourcesFile = path.join(dir, '.sources.json');
  if (!fs.existsSync(sourcesFile)) {
    return false;
  }

  const foundSources = JSON.parse(fs.readFileSync(sourcesFile, {encoding: 'utf-8'}));
  if (!_.isEqual(foundSources, sources)) {
    return false;
  }

  return true;
};

/**
 * Stamp a directory as having been created with the given sources
 */
exports.stampDir = ({dir, sources}) => {
  const sourcesFile = path.join(dir, '.sources.json');
  fs.writeFileSync(sourcesFile, JSON.stringify(sources));
};

/**
 * Perform a git clone
 *
 * - dir -- directory to clone to
 * - url -- repo#ref URL to clone
 * - utils -- taskgraph utils (waitFor, etc.)
 *
 * Returns:
 * {
 *   exactRev: ..,     // the exact revision checked out
 *   changed: ..,      // true if the repo was cloned or the revision changed
 * }
 */
exports.gitClone = async ({dir, url, sha, utils}) => {
  const [repo, ref = 'master'] = url.split('#');

  if (!fs.existsSync(dir)) {
    await git('/').clone(repo, dir, ['--depth=1', `-b${ref}`]);
    const exactRev = (await git(dir).revparse(['HEAD'])).split(/\s+/)[0];
    return {exactRev, changed: true};
  }

  const existingRev = (await git(dir).revparse(['HEAD'])).split(/\s+/)[0];
  // note: this is often empty -- https://github.com/steveukx/git-js/pull/252
  const remoteRev = (await git(dir).listRemote([repo, ref])).split(/\s+/)[0];

  if (existingRev === remoteRev) {
    return {exactRev: existingRev, changed: false};
  }

  await git(dir).fetch([repo, ref]);
  await git(dir).reset(['--hard', 'FETCH_HEAD']);

  const exactRev = (await git(dir).revparse(['HEAD'])).split(/\s+/)[0];
  return {exactRev, changed: true};
};

/**
 * Set up to call docker in the given baseDir (internal use only)
 */
const _dockerSetup = ({baseDir}) => {
  const inner = async ({baseDir}) => {
    docker = new Docker();
    // when running a docker container, always remove the container when finished, 
    // mount the workdir at /workdir, and run as the current (non-container) user
    // so that file ownership remains as expected.  Set up /etc/passwd and /etc/group
    // to define names for those uid/gid, too.
    const {uid, gid} = os.userInfo();
    fs.writeFileSync(path.join(baseDir, 'passwd'),
      `root:x:0:0:root:/root:/bin/bash\nbuilder:x:${uid}:${gid}:builder:/:/bin/bash\n`);
    fs.writeFileSync(path.join(baseDir, 'group'),
      `root:x:0:\nbuilder:x:${gid}:\n`);
    dockerRunOpts = {
      AutoRemove: true,
      User: `${uid}:${gid}`,
      Env: [
        'HOME=/app',
      ],
      Binds: [
        `${baseDir}/passwd:/etc/passwd:ro`,
        `${baseDir}/group:/etc/group:ro`,
      ],
    };

    return {docker, dockerRunOpts};
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
 * - utils -- taskgraph utils (waitFor, etc.)
 */
exports.dockerRun = async ({baseDir, logfile, command, env, binds, workingDir, image, utils}) => {
  const {docker, dockerRunOpts} = await _dockerSetup({baseDir});

  const output = new PassThrough();
  if (logfile) {
    output.pipe(fs.createWriteStream(logfile));
  }

  const {Binds, Env, ...otherOpts} = dockerRunOpts;

  const runPromise = docker.run(
    image,
    command,
    output,
    {
      Binds: [...Binds, ...binds || []],
      Env: [...Env, ...env || []],
      WorkingDir: workingDir,
      ...otherOpts,
    },
  );

  await utils.waitFor(output);
  const container = await utils.waitFor(runPromise);
  if (container.output.StatusCode !== 0) {
    throw new Error(`Container exited with status ${container.output.StatusCode}`);
  }
};

/**
 * Pull an image from a docker registry (`docker pull`)
 *
 * - baseDir -- base directory for operations
 * - image -- image to run it in
 * - utils -- taskgraph utils (waitFor, etc.)
 */
exports.dockerPull = async ({baseDir, image, utils}) => {
  const {docker, dockerRunOpts} = await _dockerSetup({baseDir});

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
          total = _.sum(Object.values(totals)) * 2;
          current = _.sum(Object.values(downloading)) + _.sum(Object.values(extracting));
          utils.status({progress: current * 100 / total});
        }
      });
  }));
};

/**
 * Build a docker image (`docker build`).
 *
 * - baseDir -- base directory for operations
 * - logfile -- name of the file to write the log to
 * - tag -- tag to build
 * - tarball -- tarfile containing the Dockerfile and any other required files
 * - utils -- taskgraph utils (waitFor, etc.)
 */
exports.dockerBuild = async ({baseDir, logfile, tag, tarball, utils}) => {
  const {docker, dockerRunOpts} = await _dockerSetup({baseDir});

  utils.status({progress: 0, message: `Building ${tag}`});
  const buildStream = await docker.buildImage(tarball, {t: tag});
  if (logfile) {
    buildStream.pipe(fs.createWriteStream(logfile));
  }

  await utils.waitFor(new Observable(observer => {
    docker.modem.followProgress(buildStream,
      err => err ? observer.error(err) : observer.complete(),
      update => {
        if (!update.stream) {
          return;
        }
        observer.next(update.stream);
        const parts = /^Step (\d+)\/(\d+)/.exec(update.stream);
        if (parts) {
          utils.status({progress: 100 * parseInt(parts[1], 10) / (parseInt(parts[2], 10) + 1)});
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
    // Acces the registry API directly to see if this tag already exists, and do not push if so.
    // TODO: this won't work with custom registries!
    const res = await got(`https://index.docker.io/v1/repositories/${repo}/tags`, {json: true});
    if (res.body && _.includes(res.body.map(l => l.name), imagetag)) {
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
 * - utils -- taskgraph utils (waitFor, etc.)
 */
exports.dockerPush = async ({baseDir, tag, logfile, utils}) => {
  const {docker, dockerRunOpts} = await _dockerSetup({baseDir});

  await utils.waitFor(new Observable(observer => {
    const push = spawn('docker', ['push', tag]);
    push.on('error', err => observer.error(err));
    if (logfile) {
      const logStream = fs.createWriteStream(logfile);
      push.stdout.pipe(logStream);
      push.stderr.pipe(logStream);
    }
    push.stdout.pipe(split(/\r?\n/, null, {trailing: false})).on('data', d => observer.next(d.toString()));
    push.stderr.pipe(split(/\r?\n/, null, {trailing: false})).on('data', d => observer.next(d.toString()));
    push.on('exit', (code, signal) => {
      if (code !== 0) {
        observer.error(new Error(`push failed! check ${logfile} for reason`));
      } else {
        observer.complete();
      }
    });
  }));
};

