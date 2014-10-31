#!/usr/bin/env python
import setup
import pip
pip.main(['install'] + setup.tests_require + setup.install_requires)
