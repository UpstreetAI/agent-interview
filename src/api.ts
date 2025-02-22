import { Readable, Writable } from 'stream';
import {
  runInterview,
  type ProcessingCb,
} from './lib/run-interview.ts';
import {
  type AgentInterviewMode,
} from './lib/agent-interview.ts';
import {
  type AbstractAgent,
} from './types/agent.ts';
import {
  type AbstractRegistry,
} from './types/registry.ts';
import {
  createAbstractAgent,
} from './lib/agent.ts';

//

export const eventMessages = [
  'avatar',
  'homespace',
  'name',
  'bio',
  'description',
  'features',
  'change',
];
export const createAgent = async ({
  prompt,
  mode,
  inputStream,
  outputStream,
  errorStream,
  events,
  processingCb,
  profilePicture,
  homeSpace,
  registry,
}: {
  prompt?: string;
  mode?: AgentInterviewMode;
  inputStream?: Readable;
  outputStream?: Writable;
  errorStream?: Writable;
  events?: EventTarget;
  processingCb?: ProcessingCb;
  input?: string;
  profilePicture?: string;
  homeSpace?: string;
  registry: AbstractRegistry;
  features?: string[];
}) => {
  let agent = createAbstractAgent();
  agent = await runInterview(agent, {
    prompt,
    mode,
    inputStream,
    outputStream,
    errorStream,
    events,
    processingCb,
    registry,
  });
  return agent;
};

export const editAgent = async ({
  agent = createAbstractAgent(),
  prompt,
  mode,
  inputStream,
  outputStream,
  errorStream,
  events,
  processingCb,
  profilePicture,
  homeSpace,
  registry,
}: {
  agent?: AbstractAgent;
  prompt?: string;
  mode?: AgentInterviewMode;
  inputStream?: Readable;
  outputStream?: Writable;
  errorStream?: Writable;
  events?: EventTarget;
  processingCb?: ProcessingCb;
  input?: string;
  profilePicture?: string;
  homeSpace?: string;
  registry: AbstractRegistry;
  features?: string[];
}) => {
  agent = await runInterview(agent, {
    prompt,
    mode,
    inputStream,
    outputStream,
    errorStream,
    events,
    processingCb,
    registry,
  });
  return agent;
};