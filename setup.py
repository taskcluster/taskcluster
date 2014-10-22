#!/usr/bin/env python

from setuptools import setup

setup(
  name='taskcluster',
  version='0.0.1',
  description='Python client for Taskcluster',
  author='John Ford',
  author_email='jhford@mozilla.com',
  url='taskcluster.github.io/taskcluster-client.py',
  packages=['taskcluster'],
  package_data={
    'taskcluster.client': ['apis.json']
  },
  install_requires=[
    'requests==2.4.3',
    'PyHawk==0.1.3',
  ],
  test_suite="nose.collector",
  tests_require=[
    'nose==1.3.4',
    'httmock==1.2.2',
    'rednose==0.4.1',
    'mock==1.0.1',
    'setuptools-lint==0.3',
  ]
)
