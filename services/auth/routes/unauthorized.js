/** Unauthorized splash */
module.exports = function(req, res){
  res.render('unauthorized', {title: 'Access Denied'});
}