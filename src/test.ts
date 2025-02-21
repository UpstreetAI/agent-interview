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
import {
  type AbstractRegistry,
} from './types/registry.ts';

//

const testRegistry = async ({
  registry,
}: {
  registry: AbstractRegistry;
}) => {
  const events = new EventTarget();
  const inputStream = new PassThrough();
  inputStream.end();
  const outputStream = new PassThrough();
  outputStream.pipe(process.stdout);
  // const errorStream = new PassThrough();
  // errorStream.pipe(process.stderr);

  const agent = await createAgent({
    prompt: 'You are Donald Trump.',
    events,
    inputStream,
    outputStream,
    // errorStream,
    registry,
    format: 'react-agents',
  });
  console.log(agent);
};
const test = async () => {
  dotenv.config();
  await testRegistry({
    registry: new ReactAgentsRegistry(),
  });
  // await testRegistry({
  //   registry: new ElizaosRegistry(),
  // });
};
(async () => {
  dotenv.config();
  await test();
})();
