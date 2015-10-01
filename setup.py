#!/usr/bin/env python

# The VERSION variable is automagically changed
# by release.sh.  Make sure you understand how
# that script works if you want to change this
VERSION='0.0.27'

from setuptools import setup

tests_require = [
  'nose==1.3.4',
  'httmock==1.2.2',
  'rednose==0.4.1',
  'mock==1.0.1',
  'setuptools-lint==0.3',
  'flake8==2.2.5',
  'subprocess32==3.2.6',
  'psutil==2.1.3',
  'hypothesis',
  'pgpy',
  'twine',
]

install_requires = [
  'requests>=2.4.3,<=2.7.0',
  'PyHawk_with_a_single_extra_commit==0.1.5',
  #  'PyHawk==0.1.4',
  'slugid',
]

if __name__ == '__main__':
  setup(
    name='taskcluster',
    version=VERSION,
    description='Python client for Taskcluster',
    author='John Ford',
    author_email='jhford@mozilla.com',
    url='taskcluster.github.io/taskcluster-client.py',
    packages=['taskcluster'],
    package_data={
      'taskcluster': ['**.json']
    },
    install_requires=install_requires,
    test_suite="nose.collector",
    tests_require=tests_require,
    zip_safe=False,
  )
