var fs          = require('fs');
var path        = require('path');

/** List files in folder recursively */
exports.listFolder = function(folder, fileList) {
  if (fileList == undefined) {
    fileList = [];
  }
  fs.readdirSync(folder).forEach(function(obj) {
    var objPath = path.join(folder, obj);
    if (fs.statSync(objPath).isDirectory()) {
      return exports.listFolder(objPath, fileList);
    } else {
      fileList.push(objPath);
    }
  });
  return fileList;
};
