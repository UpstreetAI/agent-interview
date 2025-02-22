import {
  Readable,
  Writable,
  PassThrough,
} from 'stream';
import dotenv from 'dotenv';
import {
  createAgent,
  // editAgent,
  eventMessages,
} from './api.ts';
import {
  type AbstractRegistry,
} from './types/registry.ts';
import {
  type AgentInterviewMode,
} from './lib/agent-interview.ts';
import {
  ReactAgentsRegistry,
} from './registries/react-agents/react-agents-registry.ts';
import {
  ElizaosRegistry,
} from './registries/elizaos/elizaos-registry.ts';

//

const test = async ({
  prompt,
  inputStream,
  outputStream,
  events,
  mode,
  registry,
}: {
  prompt?: string;
  inputStream?: Readable;
  outputStream?: Writable;
  events?: EventTarget;
  mode?: AgentInterviewMode;
  registry: AbstractRegistry;
}) => {
  const agent = await createAgent({
    prompt,
    events,
    inputStream,
    outputStream,
    mode,
    registry,
    format: 'react-agents',
  });
  console.log(JSON.stringify({
    ...agent,
    avatarUrl: agent.avatarUrl?.slice(0, 100) + '...',
    homespaceUrl: agent.homespaceUrl?.slice(0, 100) + '...',
  }, null, 2));
};
const testAll = async () => {
  dotenv.config();

  // auto
  {
    const outputStream = new PassThrough({
      objectMode: true,
    });
    outputStream.pipe(process.stdout);
    await test({
      prompt: 'You are Donald Trump. You must support the TTS feature.',
      outputStream,
      mode: 'auto',
      registry: new ReactAgentsRegistry(),
    });
  }

  // interactive
  {
    const inputStream = new PassThrough({
      objectMode: true,
    });
    inputStream.end('You are Donald Trump. You must support the TTS feature.');
    const outputStream = new PassThrough({
      objectMode: true,
    });
    outputStream.pipe(process.stdout);
    const events = new EventTarget();
    eventMessages.forEach(eventType => {
      events.addEventListener(eventType, (e: MessageEvent) => {
        console.log(eventType, e.data);
      });
    });
    await test({
      inputStream,
      outputStream,
      events,
      mode: 'interactive',
      registry: new ReactAgentsRegistry(),
    });
  }

  // await testRegistry({
  //   prompt: 'You are Donald Trump. You must support the TTS feature.',
  //   registry: new ElizaosRegistry(),
  // });
};
(async () => {
  dotenv.config();
  await testAll();
})();
