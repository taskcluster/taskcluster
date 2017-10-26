const assert = require('assert');
const Debug = require('debug');
const fs = require('fs-ext');
const Promise = require('promise');

let debug = Debug('docker-worker:lib:shared_file_lock');

class SharedFileLock {
  /* This acts as a semaphore which locks a file if one or more locks
   * are acquired on this object until they are released.
   *
   * @param lockFile Fd of file to be locked. Must already exist and not be exclusively locked.
   */
  constructor(lockFd) {
    this.count = 0;
    this.lockFd = lockFd;
    this.locked = false;
  }

  //acquires a lock, at >=1 locks it will flock the lockfile
  async acquire() {
    if(this.count === 0 || !this.locked) {
      let err = await Promise.denodeify(fs.flock)(this.lockFd, 'shnb');
      if(err) {
        debug('[alert-operator] couldn\'t acquire lock, this is probably bad');
        debug(err);
      } else {
        this.locked = true;
        debug('locked');
      }
    }
    this.count += 1;
    debug('acquire; count is %s', this.count);
  }

  //releases a lock after some delay, at 0 locks it will unlock the lockfile
  async release(delay = 0) {
    if(delay > 0) {
      return setTimeout(() => {this.release()}, delay);
    }
    assert(this.count > 0, "Has been released more times than acquired");
    this.count -= 1;
    if(this.count === 0 && this.locked) {
      let err = await Promise.denodeify(fs.flock)(this.lockFd, 'un');
      if(err) {
        debug('[alert-operator] couldn\'t unlock, this is probably bad');
        debug(err);
      } else {
        this.locked = false;
        debug('unlocked');
      }
    }
    debug('released; count is %s', this.count);
  }
}

module.exports = SharedFileLock;
