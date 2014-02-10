/**
* Copyright (c) Microsoft.  All rights reserved.
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*   http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/

'use strict';

var should = require('should');
var sinon = require('sinon');

var envconf = require('../lib/index');

describe('Config', function () {
  it('should be creatable by new', function () {
    var c = envconf.createConfig();
    should.exist(c);
  });

  it('should return a unique object for named environments', function () {
    var c = envconf.createConfig();
    var dev = c('dev');
    var prod = c('prod');

    should.exist(dev);
    should.exist(prod);

    dev.should.not.equal(prod);
  });

  it('should return itself if invoked without environment', function () {
    var c = envconf.createConfig();
    c().should.equal(c);
  });

  it('should return same object for same environment', function () {
    var c = envconf.createConfig();
    var d1 = c('dev');
    var d2 = c('dev');

    d1.should.equal(d2);
  });

  it('should store settings by name', function () {
    var c = envconf.createConfig();
    c.configure(function (c) {
      c.set('settingOne', 'aValue');
      c.set('secondSetting', 37);
    });

    c.get('settingOne').should.equal('aValue');
    c.get('secondSetting').should.equal(37);
  });

  it('should store settings in environments', function () {
    var c = envconf.createConfig();

    c.configure('dev', function (c) {
      c.set('settingOne', 'devOne');
      c.set('secondSetting', 37);
    });

    c.configure('prod', function (c) {
      c.set('settingOne', 'prodOne');
      c.set('secondSetting', 42);
    });

    c('dev').get('settingOne').should.equal('devOne');
    c('prod').get('settingOne').should.equal('prodOne');
    should.not.exist(c.get('settingOne'));

    c('dev').get('secondSetting').should.equal(37);
    c('prod').get('secondSetting').should.equal(42);
    should.not.exist(c.get('secondSetting'));
  });

  it('should set values in subenvironments', function () {
    var c = envconf.createConfig();

    c.configure('dev', function (c) {
      c.configure('dev2', function (c) {
        c.set('settingOne', 'dev2Setting');
      });
      c.configure('dev3', function (c) {
        c.set('settingOne', 'dev3Setting');
      });
      c.set('settingOne', 'devSetting');
    });

    should.not.exist(c.get('settingOne'));
    c('dev').get('settingOne').should.equal('devSetting');
    c('dev')('dev2').get('settingOne').should.equal('dev2Setting');
    c('dev')('dev3').get('settingOne').should.equal('dev3Setting');
  });

  it('should look up parent configs to find setting', function () {
    var c = envconf.createConfig();

    c.configure(function (c) {
      c.set('settingOne', 'defaultValue');
      c.configure('dev', function (c) {
        c.set('settingTwo', 'devValue');
      });
    });

    c('dev').get('settingTwo').should.equal('devValue');
    c('dev').get('settingOne').should.equal('defaultValue');
    should.not.exist(c('dev').get('settingThree'));
  });
});

describe('Config and environment', function () {
  var c;
  var originalEnv;

  beforeEach(function () {
    originalEnv = process.env.NODE_ENV;
    c = envconf.createConfig();
    c.configure(function (c) {
      c.set('settingOne', 'fromRoot')
        .set('settingTwo', 'fromRoot')
        .set('settingThree', 'fromRoot');
    });

    c.configure('dev', function (c) {
      c.set('settingTwo', 'fromDev');
      c.set('devOnly', 'fromDev');
    });

    c.configure('prod', function (c) {
      c.set('settingOne', 'fromProd');
      c.set('settingTwo', 'fromProd');
      c.set('prodOnly', 'fromProd');
    });
  });

  afterEach(function () {
    process.env.NODE_ENV = originalEnv;
  });

  it('should have default environment from NODE_ENV', function () {
    process.env.NODE_ENV = 'prod';

    c.default.get('settingTwo').should.equal('fromProd');

    process.env.NODE_ENV = 'dev';

    c.default.get('settingTwo').should.equal('fromDev');
  });

  it('should look up to parent config when using default', function () {
    process.env.NODE_ENV = 'dev';

    c.default.get('settingOne').should.equal('fromRoot');
    c.default.get('settingTwo').should.equal('fromDev');

    process.env.NODE_ENV = 'prod';

    c.default.get('settingOne').should.equal('fromProd');
    c.default.get('settingTwo').should.equal('fromProd');
  });

  it('should use root environment as default if NODE_ENV not given', function () {
      delete process.env.NODE_ENV;
      c.default.should.equal(c);

      c.default.get('settingOne').should.equal('fromRoot');
      c.default.get('settingTwo').should.equal('fromRoot');
  });

  it('should have setting based on hierarchy', function () {
    c('prod').has('settingTwo').should.be.true;
    c('dev').has('settingTwo').should.be.true;
    c('dev').has('settingThree').should.be.true;
    c('dev').has('prodOnly').should.be.false;
    c('prod').has('prodOnly').should.be.true;
    c('prod').has('devOnly').should.be.false;
    c('prod').has('settingThree').should.be.true;
  });

  it('should list environments', function () {
    c.environments.should.include('dev');
    c.environments.should.include('prod');
  });

  it('should list settings across hierarchy', function () {
    var expected = ['prodOnly', 'settingTwo', 'settingOne', 'settingThree'];
    expected.forEach(function (setting) {
      c('prod').settings.should.include(setting, 'expected setting ' + setting + ' but it was not found');
    });
  });
});

describe('Config with custom environment var', function () {
  var c;
  var originalEnv;

  beforeEach(function () {
    originalEnv = process.env.CUSTOM_ENV_VAR;
    c = envconf.createConfig({defaultEnvVar: 'CUSTOM_ENV_VAR'});

    c.configure(function (c) {
      c.set('settingOne', 'fromRoot')
        .set('settingTwo', 'fromRoot')
        .set('settingThree', 'fromRoot');
    });

    c.configure('dev', function (c) {
      c.set('settingTwo', 'fromDev');
      c.set('devOnly', 'fromDev');
    });

    c.configure('prod', function (c) {
      c.set('settingOne', 'fromProd');
      c.set('settingTwo', 'fromProd');
      c.set('prodOnly', 'fromProd');
    });
  });

  afterEach(function () {
    process.env.CUSTOM_ENV_VAR = originalEnv;
  });

  it('should choose default from custom var', function () {
    process.env.CUSTOM_ENV_VAR = 'prod';
    c.default.get('settingOne').should.equal('fromProd');
  });
});

describe('Config customization', function () {
  var count;
  function configCustomizer(config) {
    config.customValue = ++count;
  }

  var spy;

  beforeEach(function () {
    count = 0;
    spy = sinon.spy(configCustomizer);
  });

  it('should call customizer when creating config', function () {
    var c = envconf.createConfig({ customizer: spy });
    spy.callCount.should.equal(1);
  });

  it('should pass config to the customizer', function () {
    var c = envconf.createConfig({ customizer: spy });
    spy.calledWith(c).should.be.true;
  });

  it('should affect config when customized', function () {
    var c = envconf.createConfig({ customizer: spy });
    c.customValue.should.equal(1);
  });

  it('should call customizer for each environment', function () {
    var c = envconf.createConfig({ customizer: spy });
    c('dev');
    c('prod');
    spy.callCount.should.equal(3);
  });

  it('should call customizer once per environment', function () {
    var c = envconf.createConfig({ customizer: spy });
    c('dev');
    c('dev');
    c('dev');

    spy.callCount.should.equal(2);
  });
});

describe('Snapshot and restore', function () {
  it('should save and restore configuration state', function () {
    var c = envconf.createConfig();
    c.configure(function () {
      c.set('first', 'one');
      c.set('second', 'two');
    });

    var ss = c.snapshot();
    c.set('first', 'changed');
    c.set('added', 'new value');

    c.restore(ss);

    c.get('first').should.equal('one');
    c.get('second').should.equal('two');
    should.not.exist(c.get('added'));
  });

  it('should save and restore child environments', function () {
    var c = envconf.createConfig();
    c.configure('dev', function (dev) {
      dev.set('devFirst', 'one');
      dev.configure('devsub', function (devsub) {
        devsub.set('subsubFirst', 'a sub sub value');
      });
    });

    c.configure('prod', function (prod) {
      prod.set('prodvalue', 'a value');
    });

    var snapshot = c.snapshot();

    c('dev').set('devFirst', 'changed value');
    c('prod').configure('addedEnvironment', function (added) {
      added.set('newEnvValue', 1234);
    });

    c.restore(snapshot);

    c('dev').get('devFirst').should.equal('one');
    c('prod').environments.should.not.include('addedEnvironment');
  });

  it('should fail if trying to restore an invalid snapshot', function () {
    var c = envconf.createConfig();

    (function () { c.restore([{}, {}]); }).should.throw();
  });
});

describe('Temporary environments', function () {
  var c;
  var customizer;

  beforeEach(function () {
    customizer = sinon.spy();
    c = envconf.createConfig({customizer: customizer});
    c.set('parentValue', 'from parent');
  });

  it('should create a temp environment that looks up to parent', function () {
    var temp = c.tempConfig();
    temp.get('parentValue').should.equal('from parent');
  });

  it('should be independent of parent', function () {
    var temp = c.tempConfig();
    temp.set('tempValue', 'from temp');
    c.has('tempValue').should.be.false;
  });

  it('should not be referred to from parent', function () {
    var temp = c.tempConfig();
    c.environments.length.should.equal(0);
  });

  it('should be independent of each other', function () {
    var t1 = c.tempConfig();
    var t2 = c.tempConfig();

    t2.set('tempValue', 'from t2');
    should.not.exist(t1.get('tempValue'));
  });

  it('should be run through customizer', function () {
    var temp = c.tempConfig();
    customizer.callCount.should.equal(2);
  });
});

describe('Setting getters', function () {
  var c;

  beforeEach(function () {
    c = envconf.createConfig();
  });

  it('should call getter when retrieving', function () {
    function getter() { return 'a value'; }
    var spy = sinon.spy(getter);
    c.setFunc('setting', spy);
    c.get('setting').should.equal('a value');
    spy.callCount.should.equal(1);
  });

  it('should not be invoked when set using set method', function () {
    function getter() { return 'a value'; }
    var spy = sinon.spy(getter);
    c.set('setting', spy);
    c.get('setting').should.equal(spy);
    spy.callCount.should.equal(0);    
  });
});