const assert = require('assert');

class FakeNotify {
  constructor() {
    this.widgets = new Set();
  }

  /* helpers */

  reset() {
    this.widgets = new Set();
  }

  addWidget(name) {
    assert(typeof name === "string");
    this.widgets.add(name);
  }

  /* fake functions */

  async update_widgets(name) {
    this.widgets.add(name);
    return [...this.widgets].map(name => ({name}));
  }
}

module.exports = FakeNotify;
