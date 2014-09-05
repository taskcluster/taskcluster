#include "binding.h"
#include "nan.h"
using namespace v8;

void RegisterModule(Handle<Object> target) {

#ifdef is_linux
  target->Set(NanNew<String>("HERTZ"), NanNew<Number>(sysconf(_SC_CLK_TCK)));
  target->Set(NanNew<String>("PAGE_SIZE"), NanNew<Number>(sysconf(_SC_PAGESIZE)));
#endif

#ifdef is_solaris
  target->Set(NanNew<String>("getUsage"),
    FunctionTemplate::New(GetUsage)->GetFunction());
#endif
  target->Set(NanNew<String>("OS"), NanNew<String>(OS));
}

NODE_MODULE(sysinfo, RegisterModule);
