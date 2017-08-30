import emitter from './vendor/mitt';
import { v4 } from 'slugid';

const READY_STATE = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 4,
};

export default class WebListener {
  constructor(options) {
    this.emitter = emitter();
    this.options = {
      baseUrl: 'https://events.taskcluster.net/v1',
      ...options
    };

    this._bindings = [];
    this._pendingPromises = [];
  }

  on(eventName, handler) {
    this.emitter.on(eventName, handler);
    return this;
  }

  off(eventName, handler) {
    this.emitter.off(eventName, handler);
    return this;
  }

  async connect() {
    const { baseUrl } = this.options;
    const socketUrl = baseUrl.endsWith('/') ? `${baseUrl}listen` : `${baseUrl}/listen`;

    this.socket = new WebSocket(socketUrl);
    this.socket.addEventListener('message', this.handleMessage);
    this.socket.addEventListener('error', this.handleError);
    this.socket.addEventListener('close', this.handleClose);

    await new Promise((resolve, reject) => {
      this.socket.addEventListener('error', reject);
      this.socket.addEventListener('close', reject);
      this.socket.addEventListener('open', () => {
        // Remove event handler for error and close
        this.socket.removeEventListener('error', reject);
        this.socket.removeEventListener('close', reject);
        resolve();
      });
    });

    const awaitingBindings = Promise.all(this._bindings.map(binding => this._send('bind', binding)));

    const isReady = new Promise((resolve, reject) => {
      const resolver = () => {
        this.off('ready', resolver);
        this.off('error', rejector);
        this.off('close', rejector);
        resolve();
      };
      const rejector = (err) => {
        this.off('ready', resolver);
        this.off('error', rejector);
        this.off('close', rejector);
        reject(err);
      };

      this.on('ready', resolver);
      this.on('error', rejector);
      this.on('close', rejector);
    });

    // When all bindings have been bound, we're just waiting for 'ready'
    return awaitingBindings.then(() => isReady);
  }

  _send(method, options) {
    if (!this.socket || this.socket.readyState !== READY_STATE.OPEN) {
      throw new Error('Cannot send message if socket is not OPEN');
    }

    // Create request id
    const id = v4();

    // Send message, if socket is open
    return new Promise((resolve, reject) => {
      this._pendingPromises.push({ id, resolve, reject });
      this.socket.send(JSON.stringify({ method, id, options }));
    });
  }

  handleMessage = (e) => {
    let message;

    try {
      // Attempt to parse the message
      message = JSON.parse(e.data);
    } catch (err) {
      return this.emitter.emit('error', err);
    }

    // Check that id is a string
    if (typeof message.id !== 'string') {
      return this.emitter.emit('error', new Error('Message has no id'));
    }

    this._pendingPromises = this._pendingPromises
      .filter(promise => {
        // Only keep promises that are still pending,
        // filter out the ones we are handling right now
        if (promise.id !== message.id) {
          return promise;
        }

        if (message.event === 'error') {
          promise.reject(message.payload);
        } else {
          promise.resolve(message.payload);
        }

        // These promises are no longer pending, they are handled.
        // Filter them out.
        return false;
      });

    switch (message.event) {
      case 'ready':
      case 'bound':
      case 'message':
      case 'error':
        return this.emitter.emit(message.event, message.payload || null);
      default:
        this.emit('error', new Error('Unknown event type from server'));
    }
  };

  handleError = () => this.emitter.emit('error', new Error('WebSocket error'));

  handleClose = () => this.emitter.emit('close');

  bind(binding) {
    // Store the binding so we can connect, if not already there
    this._bindings.push(binding);

    // If already open send the bind request
    return this.socket && this.socket.readyState === READY_STATE.OPEN ?
      this._send('bind', binding) :
      Promise.resolve();
  }

  close() {
    if (!this.socket || this.socket.readyState === READY_STATE.CLOSED) {
      return Promise.resolve();
    }

    return new Promise(resolve => {
      this.emitter.once('close', resolve);
      this.socket.close();
    });
  }

  resume() {
    return this.connect();
  }

  pause() {
    return this.close();
  }
}
