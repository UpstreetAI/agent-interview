import {
  // Readable,
  // Writable,
  PassThrough,
} from 'stream';
import dotenv from 'dotenv';
import {
  createAgent,
  // editAgent,
  ReactAgentsRegistry,
  ElizaosRegistry,
} from './api.ts';

const test = async () => {
  const events = new EventTarget();
  const inputStream = new PassThrough();
  inputStream.end();
  const outputStream = new PassThrough();
  outputStream.pipe(process.stdout);

  const registry = new ElizaosRegistry();
  const agent = await createAgent({
    prompt: 'You are Donald Trump.',
    events,
    inputStream,
    outputStream,
    registry,
    format: 'react-agents',
  });
  console.log(agent);
};
(async () => {
  dotenv.config();
  await test();
})();
