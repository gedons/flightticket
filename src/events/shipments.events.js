// src/events/shipments.events.js
const EventEmitter = require('events');
const emitter = new EventEmitter();
// increase max listeners for many clients (tune as needed)
emitter.setMaxListeners(1000);
module.exports = emitter;
