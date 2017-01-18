from __future__ import absolute_import, division, print_function, \
    unicode_literals
import inspect
import taskcluster as c

print("="*80)
print("Taskcluster Client")
print("="*80)

print(':toc')

for thing, thang in inspect.getmembers(c, lambda x: inspect.isclass(x)):
    print(".. autoclass:: taskcluster.%s" % thing)
    print("    :members:")
    print(".. autoclass:: taskcluster.async.%s" % thing)
    print("    :members:")
