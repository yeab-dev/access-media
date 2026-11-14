// Things that happen on the server, for webhooks. Payloads carry no personal data.
import { EventEmitter } from 'node:events';
export const events = new EventEmitter();
