import mkdirp from 'mkdirp';
import rmrf from 'rimraf';

export function makeDir(directory) {
  return new Promise(function(accept, reject) {
    mkdirp(directory, function (error) {
      if (error) return reject(error);
      accept(error);
    });
  });
}

export function removeDir(directory) {
  return new Promise(function(accept, reject) {
    rmrf(directory, function (error) {
      if (error) return reject(error);
      accept(error);
    });
  });
}
