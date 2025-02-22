import { Readable, Writable } from 'stream';

import {
  type AbstractRegistry,
} from '../types/registry.ts';
import {
  type AbstractAgent,
} from '../types/agent.ts';
import {
  eventMessages,
} from '../api.ts';
import {
  AgentInterview,
  type AgentInterviewMode,
} from './agent-interview.ts';
import {
  ImageRenderer,
  loadImage,
} from 'terminal-image-renderer';
import InterviewLogger from './logger/interview-logger.mjs';
// import ReadlineStrategy from './logger/readline.mjs';
import StreamStrategy from './logger/stream.mjs';

//

export type ProcessingCb = (isProcessing: boolean) => void;

const logAgentPropertyUpdate = (propertyName, newValue) => {
  // ANSI escape codes for colors
  const colors = {
    blue: '\x1b[34m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
  };

  if (typeof newValue === 'object' && newValue !== null) {
    console.log(`${colors.blue}${colors.bold}[AGENT UPDATE]${colors.reset} ${colors.cyan}${propertyName}${colors.reset}`);
    Object.entries(newValue).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        console.log(`  ${colors.dim}→${colors.reset} ${colors.yellow}${key}${colors.reset}: ${colors.green}${value}${colors.reset}`);
      }
    });
  } else {
    console.log(
      `${colors.blue}${colors.bold}[AGENT UPDATE]${colors.reset} ${colors.cyan}${propertyName}${colors.reset} ${colors.dim}→${colors.reset} ${colors.green}${newValue}${colors.reset}`
    );
  }
};

const propertyLogger = (prefix) => (e) => {
  logAgentPropertyUpdate(prefix, e.data);
};

//

type RefSpec = {
  ref: string;
  refValue: string;
};
class KeyCache {
  private cache = new Map<string, RefSpec>();
  save(object: any, keys: string[]) {
    for (const key of keys) {
      const refValue = object[key];
      if (refValue !== undefined) {
        const ref = `blob:${crypto.randomUUID()}`;
        this.cache.set(key, {
          ref,
          refValue,
        });
        object[key] = ref;
      }
    }
  }
  restore(object: any) {
    for (const [key, refSpec] of this.cache.entries()) {
      if (object[key] === refSpec.ref) {
        object[key] = refSpec.refValue;
      }
    }
  }
}

export const runInterview = async (agentJson: AbstractAgent, {
  prompt,
  mode,
  inputStream,
  outputStream,
  errorStream,
  events,
  processingCb,
  registry,
}: {
  prompt?: string;
  mode?: AgentInterviewMode;
  inputStream?: Readable;
  outputStream?: Writable;
  errorStream?: Writable;
  events?: EventTarget;
  processingCb?: ProcessingCb;
  registry?: AbstractRegistry;
}): Promise<AbstractAgent> => {
  // this is to prevent tokens from being used up by the avatar and homespace urls
  const keyCache = new KeyCache();
  keyCache.save(agentJson, ['avatarUrl', 'homespaceUrl']);

  const questionLogger = new InterviewLogger(
    /* inputStream && outputStream
      ? */new StreamStrategy(inputStream, outputStream)
    // : new ReadlineStrategy(),
  );

  const getAnswer = async (question: string) => {
    const answer = await questionLogger.askQuestion(question);
    return answer;
  };
  const featureSpecs = await registry.getAllPlugins();
  const opts = {
    agentJson,
    prompt,
    mode,
    featureSpecs,
  };

  const agentInterview = new AgentInterview(opts);
  agentInterview.addEventListener('input', async (e: MessageEvent) => {
    const {
      question,
    } = e.data;
    // console.log('agent interview input 1', {
    //   question,
    // });

    const answer = await getAnswer(question);

    // console.log('agent interview input 2', {
    //   question,
    //   answer,
    // });

    agentInterview.write(answer);
  });
  agentInterview.addEventListener('output', async (e: MessageEvent) => {
    const {
      text,
    } = e.data;
    // console.log('agent interview output', {
    //   text,
    // });
    questionLogger.log(text);
  });
  if (processingCb) {
    agentInterview.addEventListener('processingStateChange', (event: MessageEvent) => {
      // try {
        const {
          isProcessing,
        } = event.data;
        processingCb(isProcessing);
      // } catch (error) {
      //   console.error('Spinner error:', error);
      // }
    });
  }

  if (events) {
    eventMessages.forEach(eventType => {
      agentInterview.addEventListener(eventType, (e: MessageEvent) => {
        events.dispatchEvent(new MessageEvent(eventType, {
          data: e.data,
        }));
      });
    });
  } else {
    const imageLogger = (label) => async (e) => {
      const {
        result: blob,
        signal,
      } = e.data;

      const ab = await blob.arrayBuffer();
      if (signal.aborted) return;

      const b = Buffer.from(ab);
      
      const image = await loadImage(b);
      if (signal.aborted) return;

      const imageRenderer = new ImageRenderer();
      const consoleImagePreviewWidth = 24*2;
      const {
        text: imageText,
      } = imageRenderer.render(image.bitmap, consoleImagePreviewWidth, undefined);
      logAgentPropertyUpdate(label, '');
      console.log(imageText);
    };
    agentInterview.addEventListener('avatar', imageLogger('Avatar updated (preview):'));
    agentInterview.addEventListener('homespace', imageLogger('Homespace updated (preview):'));
    agentInterview.addEventListener('name', propertyLogger('name'));
    agentInterview.addEventListener('bio', propertyLogger('bio'));
    agentInterview.addEventListener('description', propertyLogger('description'));
    agentInterview.addEventListener('features', propertyLogger('features'));
  }
  const result = await agentInterview.waitForFinish();
  questionLogger.close();
  keyCache.restore(result);
  return result;
};