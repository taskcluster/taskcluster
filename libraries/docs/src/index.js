const documenter = require('./documenter');
const downloader = require('./downloader');

documenter.documenter = documenter; // for compoatibility
documenter.downloader = downloader;
module.exports = documenter;
