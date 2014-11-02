import inspect
import taskcluster.client as c

print "="*80
print "Taskcluster Client"
print "="*80

for thing in [x[0] for x in inspect.getmembers(c, lambda x: inspect.isclass(x))]:
    print ".. autoclass:: taskcluster.client.%s" % thing
    print "    :members:"
