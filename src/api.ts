import { Readable, Writable } from 'stream';
import {
  runInterview,
} from './cli.ts';
import {
  type AbstractRegistry,
} from './types/registry.ts';
import {
  type AbstractAgent,
  createAbstractAgent,
} from './types/agent.ts';
// import {
//   ElizaosRegistry,
// } from './registries/elizaos/elizaos-registry.ts';
import {
  ReactAgentsRegistry,
} from './registries/react-agents/react-agents-registry.ts';

//

export const createAgent = async ({
  prompt,
  inputStream,
  outputStream,
  errorStream,
  events,
  input,
  profilePicture,
  homeSpace,
  json = {},
  registry = new ReactAgentsRegistry(),
  features = [],
  format = 'react-agents',
}: {
  prompt?: string;
  inputStream?: Readable;
  outputStream?: Writable;
  errorStream?: Writable;
  events?: EventTarget;
  input?: string;
  profilePicture?: string;
  homeSpace?: string;
  json?: object;
  registry?: AbstractRegistry;
  features?: string[];
  format?: string;
}) => {
  let agentJson = createAbstractAgent();
  agentJson = await runInterview(agentJson, {
    prompt,
    mode: 'auto',
    inputStream,
    outputStream,
    errorStream,
    events,
    registry,
  });
  return agentJson;
};

// export const editAgent = async ({

// }: {
    
// }) => {

// };