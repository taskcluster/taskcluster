export default (path = '') => 
  path.replace(/\/+$/, '').replace(/\/?README\/?/, '');
