set -e
set -x
npm run compile
DEBUG= mocha --compilers js:babel/register test/loader_tests.js
