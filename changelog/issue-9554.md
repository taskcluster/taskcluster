level: patch
audience: deployers
reference: issue 9554
---
Worker pool errors from failed AWS `RunInstances` calls now record the launch configuration that failed, same as Google and Azure providers.
