import {
  PassThrough,
} from 'stream';
import dotenv from 'dotenv';
import {
  createAgent,
  // editAgent,
} from './api.ts';
import {
  ReactAgentsRegistry,
} from './registries/react-agents/react-agents-registry.ts';
import {
  ElizaosRegistry,
} from './registries/elizaos/elizaos-registry.ts';

//

const test = async () => {
  {
    const registry = new ElizaosRegistry();
    const plugins = await registry.getAllPlugins();
    console.log('elizaos plugins', plugins);
  }

  const events = new EventTarget();
  const inputStream = new PassThrough();
  inputStream.end();
  const outputStream = new PassThrough();
  outputStream.pipe(process.stdout);

  const registry = new ReactAgentsRegistry();
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
