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
  prompt,
  registry,
}: {
  prompt: string;
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
    prompt,
    events,
    inputStream,
    outputStream,
    // errorStream,
    registry,
    format: 'react-agents',
  });
  console.log(JSON.stringify({
    ...agent,
    avatarUrl: agent.avatarUrl?.slice(0, 100) + '...',
    homespaceUrl: agent.homespaceUrl?.slice(0, 100) + '...',
  }, null, 2));
};
const test = async () => {
  dotenv.config();
  await testRegistry({
    prompt: 'You are Donald Trump. You must support the TTS feature.',
    registry: new ReactAgentsRegistry(),
  });
  // await testRegistry({
  //   prompt: 'You are Donald Trump. You must support the TTS feature.',
  //   registry: new ElizaosRegistry(),
  // });
};
(async () => {
  dotenv.config();
  await test();
})();
