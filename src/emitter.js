/**
 * The MIT License (MIT)
 Copyright 2016 Andrey Sitnik <andrey@sitnik.ru>
 Permission is hereby granted, free of charge, to any person obtaining a copy of
 this software and associated documentation files (the "Software"), to deal in
 the Software without restriction, including without limitation the rights to
 use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 the Software, and to permit persons to whom the Software is furnished to do so,
 subject to the following conditions:
 The above copyright notice and this permission notice shall be included in all
 copies or substantial portions of the Software.
 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

export default class Emitter {
  events = {};

  on(eventName, handler) {
    if (process.env.NODE_ENV !== 'production' && typeof handler !== 'function') {
      throw new Error('Listener must be a function');
    }

    const event = this.events[eventName] || [];

    event.push(handler);
    this.events[eventName] = event;

    return () => this.off(eventName, handler);
  }

  off(eventName, handler) {
    const event = this.events[eventName] || [];

    event.splice(event.indexOf(handler) >>> 0, 1); // eslint-disable-line no-bitwise
  }

  emit(eventName, ...args) {
    const handlers = this.events[eventName];

    if (!handlers || !handlers[0]) {
      return;
    }

    handlers.forEach(handler => handler(...args));
  }
}
