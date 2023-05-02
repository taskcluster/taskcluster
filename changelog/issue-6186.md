audience: worker-deployers
level: patch
reference: issue 6186
---

Worker-manager refreshes worker from database before calling removeWorker on terminateAfter time exceeded to prevent from stopping workers that were already registered and running since worker scanner has started.
