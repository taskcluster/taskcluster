import Emitter from './emitter';
import { v4 } from './utils';

export default class WebListener {
  constructor(options) {
    this.emitter = new Emitter();
    this.options = {
      baseUrl: 'wss://events.taskcluster.net/v1',
      reconnectInterval: 5000,
      ...options
    };

    this._bindings = [];
    this._pendingPromises = [];
  }

  on(eventName, handler) {
    return this.emitter.on(eventName, handler);
  }

  off(eventName, handler) {
    return this.emitter.off(eventName, handler);
  }

  isOpen() {
    return this.socket && this.socket.readyState === WebSocket.OPEN;
  }

  isConnected() {
    return this.socket && this.socket.readyState !== WebSocket.CLOSED;
  }

  async connect() {
    if (this.isConnected()) {
      return Promise.resolve();
    }

    const { baseUrl } = this.options;
    const socketUrl = baseUrl.endsWith('/') ? `${baseUrl}listen/websocket` : `${baseUrl}/listen/websocket`;

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
      const offReady = this.on('ready', resolve);
      const offError = this.on('error', reject);
      const offClose = this.on('close', reject);
      const unbindAll = () => {
        offReady();
        offError();
        offClose();
      };

      this.on('ready', unbindAll);
      this.on('error', unbindAll);
      this.on('close', unbindAll);
    });

    // When all bindings have been bound, we're just waiting for 'ready'
    return awaitingBindings
      .then(() => {
        clearInterval(this.connectInterval);
        this.connectInterval = setInterval(() => {
          if (!this.isConnected()) {
            this
              .connect()
              .then(() => this.emitter.emit('reconnect'));
          }
        }, this.options.reconnectInterval);

        return isReady;
      });
  }

  _send(method, options) {
    if (!this.isOpen()) {
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

  // eslint-disable-next-line consistent-return
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
      .filter((promise) => {
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

  handleClose = () => {
    this.emitter.emit('close');
  };

  bind(binding) {
    // Store the binding so we can connect, if not already there
    this._bindings.push(binding);

    // If already open send the bind request
    return this.isOpen() ?
      this._send('bind', binding) :
      Promise.resolve();
  }

  close() {
    if (!this.isConnected()) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      clearInterval(this.connectInterval);
      this.emitter.on('close', resolve);
      this.socket.close();
    });
  }
}
