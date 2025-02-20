import { Readable, Writable } from 'stream';
import {
  runInterview,
} from './cli.ts';
import {
  type AgentConfig,
  type AbstractRegistry,
} from './registries/registry.ts';
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
  // load the plugins
  // const plugins = await registry.getAllPlugins();

  let agentJson: AgentConfig = json;
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