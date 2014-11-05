#!/usr/bin/env python
import setup
import pip
pip.main(['install', '--upgrade'] + setup.tests_require + setup.install_requires)
