
/*
 * GET home page.
 */

exports.index = function(req, res){
  res.render('index', { title: "Task Cluste Queue - Deploy Test" });
};

// Include all modules
[
  'unauthorized'
].forEach(function(module) {
  exports[module] = require('./' + module);
});

