import path from 'path';
import fs from 'fs';
import { PassThrough } from 'stream';
import readline from 'readline';

import dotenv from 'dotenv';
import { program } from 'commander';
import pc from 'picocolors';
import ansi from 'ansi-escapes';
import mime from 'mime/lite';
import ora from 'ora';
import { CharacterCardParser } from 'character-card-parser';

import {
  createAgent,
  editAgent,
} from './api.ts';
import {
  runInterview,
} from './lib/run-interview.ts';
import {
  type AgentInterviewMode,
} from './lib/agent-interview.ts';
import {
  type AbstractAgent,
} from './types/agent.ts';
import {
  ReactAgentsRegistry,
} from './registries/react-agents/react-agents-registry.ts';
import {
  ElizaosRegistry,
} from './registries/elizaos/elizaos-registry.ts';

import {
  ensureAgentJsonDefaults,
} from './lib/agent-json-util.mjs';

//

const cwd = process.cwd();

//

const getAgentJsonFromCharacterCard = async (p) => {
  const fileBuffer = await fs.promises.readFile(p);
  const fileBlob = new File([fileBuffer], path.basename(p));

  const ccp = new CharacterCardParser();
  const parsed = await ccp.parse(fileBlob);
  const {
    name,
    description,
    personality,
    scenario,
    first_mes,
    mes_example,
    creator_notes,
    system_prompt,
    post_history_instructions,
    alternate_greetings,
    character_book,
    tags,
    creator,
    character_version,
    extensions,
  } = parsed.data;
  return {
    name,
    description,
    bio: personality,
  };
};
const addAgentJsonImage = async (agentJson, p, key) => {
  const base64 = await fs.promises.readFile(p, 'base64');
  const mimeType = mime.getType(p) || 'application/octet-stream';
  const url = `data:${mimeType};base64,${base64}`;
  agentJson = {
    ...agentJson,
    [key]: url,
  };
};
const addAgentJsonFeatures = (agentJson, features) => {
  agentJson = {
    ...agentJson,
  };
  // Add user specified features to agentJsonInit being passed to the interview process for context
  if (Object.keys(features).length > 0) {
    agentJson.features = {
      ...features,
    };
  }
  return agentJson;
};
const loadAgentJson = (dstDir) => {
  const agentJsonPath = path.join(dstDir, 'agent.json');
  const agentJsonString = fs.readFileSync(agentJsonPath, 'utf8');
  const agentJson = JSON.parse(agentJsonString);
  return agentJson;
};

//

export const create = async (args, opts) => {
  // args
  let dstDir = args._[0] ?? '';
  const prompt = args.prompt ?? '';
  const inputStream = args.inputStream ?? null;
  const outputStream = args.outputStream ?? null;
  const events = args.events ?? null;
  const inputFile = args.input ?? null;
  const pfpFile = args.profilePicture ?? null;
  const hsFile = args.homeSpace ?? null;
  const agentJsonString = args.json;
  const features = typeof args.feature === 'string' ? JSON.parse(args.feature) : (args.feature || {});
  const yes = args.yes;
  // opts
  const jwt = opts.jwt;
  if (!jwt) {
    throw new Error('You must be logged in to create an agent.');
  }

  console.log(pc.italic('Generating Agent...'));
  // generate the agent
  const initialAgentJson = await (async () => {
    if (agentJsonString) {
      return JSON.parse(agentJsonString);
    } else if (inputFile) {
      return await getAgentJsonFromCharacterCard(inputFile);
    } else {
      return null;
    }
  })();
  let agentJson = initialAgentJson;
  // images
  if (pfpFile) {
    agentJson = await addAgentJsonImage(agentJson, pfpFile, 'avatarUrl');
  }
  if (hsFile) {
    agentJson = await addAgentJsonImage(agentJson, hsFile, 'homespaceUrl');
  }
  // features
  agentJson = addAgentJsonFeatures(agentJson, features);
  // run the interview, if applicable
  if (!initialAgentJson && !yes) {
    const interviewMode = prompt ? 'auto' : 'interactive';
    if (interviewMode !== 'auto') {
      console.log(pc.italic('Starting the Interview process...\n'));
    }
    agentJson = await runInterview(agentJson, {
      prompt,
      mode: interviewMode,
      inputStream,
      outputStream,
      events,
    });
  }

  agentJson = ensureAgentJsonDefaults(agentJson);

  // update destination directory if no specific path was provided
  if (dstDir === '') {
    const sanitizedName = agentJson.name
      .replace(/\s+/g, '_') // match spaces
      .replace(/[^a-zA-Z0-9_]/g, '_') // match bash-unsafe characters
      .replace(/_+/g, '_').toLowerCase();
    dstDir = path.join(cwd, sanitizedName);
  }

  console.log(pc.italic('Agent generated...'));
  console.log(pc.green('Name:'), agentJson.name);
  console.log(pc.green('Bio:'), agentJson.bio);
  console.log(pc.green('Description:'), agentJson.description);
  console.log(pc.green('Visual Description:'), agentJson.visualDescription);
  console.log(pc.green('Avatar URL:'), agentJson.avatarUrl);
  console.log(pc.green('Homespace Description:'), agentJson.homespaceDescription);
  console.log(pc.green('Homespace URL:'), agentJson.homespaceUrl);
  const featuresKeys = Object.keys(agentJson.features ?? {});
  console.log(pc.green('Features:'), featuresKeys.length > 0
    ? featuresKeys.join(', ')
    : '*none*'
  );

  events && events.dispatchEvent(new MessageEvent('finalize', {
    data: {
      agentJson,
    },
  }));

  const resolvedDstDir = path.resolve(dstDir);
  console.log('\nCreated agent at', ansi.link(resolvedDstDir, resolvedDstDir));
  console.log();
  console.log(pc.green('To start a chat with your agent, run:'));
  console.log(pc.cyan(`  usdk chat ${dstDir}`));
  console.log(pc.green(`To edit this agent again, run:`));
  console.log(pc.cyan(`  usdk edit ${dstDir}`));
  console.log();
  console.log(pc.green(`To set up your agent with a git repository, run:`));
  console.log(pc.cyan(`  git remote add origin https://github.com/USERNAME/REPOSITORY.git`));
  console.log();
  console.log(pc.green('To learn how to customize your agent with code, see the docs: https://docs.upstreet.ai/customize-your-agent'));
  console.log();
  console.log(pc.green(`Happy building!`));

  return agentJson;
};

const updateFeatures = (agentJson, {
  addFeature,
  removeFeature,
}) => {
  agentJson = {
    ...agentJson,
  };
  // console.log('add feature remove feature', {
  //   addFeature,
  //   removeFeature,
  // });

  if (removeFeature) {
    for (const feature of removeFeature) {
      delete agentJson.features[feature];
    }
  }

  if (addFeature) {
    if (!agentJson.features) {
      agentJson.features = {};
    }
    agentJson.features = {
      ...agentJson.features,
      ...addFeature,
    };
  }

  return agentJson;
};
export const edit = async (args, opts) => {
  // args
  const dstDir = args._[0] ?? cwd;
  const prompt = args.prompt ?? '';
  const inputFile = args.input ?? null;
  const pfpFile = args.profilePicture ?? null;
  const hsFile = args.homeSpace ?? null;
  const inputStream = args.inputStream ?? null;
  const outputStream = args.outputStream ?? null;
  const events = args.events ?? null;
  const addFeature = args.addFeature;
  const removeFeature = args.removeFeature;
  // opts
  const jwt = opts.jwt;
  if (!jwt) {
    throw new Error('You must be logged in to edit an agent.');
  }

  let agentJson = loadAgentJson(dstDir);

  // update character card
  if (inputFile) {
    const update = await getAgentJsonFromCharacterCard(inputFile);
    agentJson = {
      ...agentJson,
      ...update,
    };
  };

  // update images
  if (pfpFile) {
    agentJson = await addAgentJsonImage(agentJson, pfpFile, 'avatarUrl');
  }
  if (hsFile) {
    agentJson = await addAgentJsonImage(agentJson, hsFile, 'homespaceUrl');
  }

  // update features
  agentJson = updateFeatures(agentJson, {
    addFeature,
    removeFeature,
  });

  // run the interview, if applicable
  if (!(addFeature || removeFeature)) {
    agentJson = await runInterview(agentJson, {
      prompt,
      mode: prompt ? 'auto' : 'edit',
      inputStream,
      outputStream,
      events,
    });
  }

  const _updateFiles = async () => {
    await Promise.all([
      // agent.json
      (async () => {
        const agentJsonPath = path.join(dstDir, 'agent.json');
        await fs.promises.writeFile(agentJsonPath, JSON.stringify(agentJson, null, 2));
      })(),
    ]);
  };
  await _updateFiles();
};

class Spinner {
  private spinner: any;
  private currentSpinnerState: boolean; 

  constructor() {
    this.spinner = ora({
      text: '',
      spinner: {
        interval: 80,
        frames: [
          '●∙∙∙',
          '∙●∙∙',
          '∙∙●∙',
          '∙∙∙●',
          '∙∙∙∙',
        ],
      },
      discardStdin: false,
      // isEnabled: !!errorStream,
      // stream: errorStream ?? process.stderr,
    }).stop(); // initialize as stopped
    this.currentSpinnerState = false;
  }

  update(isProcessing: boolean) {
    if (isProcessing && !this.currentSpinnerState) {
      this.currentSpinnerState = true;
      this.spinner.start();
    } else if (!isProcessing && this.currentSpinnerState) {
      this.currentSpinnerState = false;
      this.spinner.stop();
    }
  }
  
  destroy() {
    this.spinner.stop();
    this.spinner = null;
    this.currentSpinnerState = false;
  }
}

const createProgram = () => {
  try {
    let commandExecuted = false;
    program
      .name('agent-interview')
      .description('Create AI agent configurations using LLMs')
      .exitOverride((err) => {
        if (!commandExecuted) {
          process.exit(0);
        }
      });

    const createReadlineInputStream = () => {
      const rl = readline.createInterface({
        input: process.stdin,
        // output: process.stdout,
        // terminal: false,
      });
      rl.on('line', (line) => {
        inputStream.write(line);
      });

      const inputStream = new PassThrough({
        objectMode: true,
      });
      return inputStream;
    };
    const createReadlineOutputStream = () => {
      const outputStream = new PassThrough({
        objectMode: true,
      });
      outputStream.on('data', (data) => {
        console.log(data);
      });
      return outputStream;
    };
    const loadAgent = async (inputFile?: string) => {
      if (inputFile) {
        const s = await fs.promises.readFile(inputFile, 'utf8');
        const abstractAgent = JSON.parse(s) as AbstractAgent;
        return abstractAgent;
      } else {
        return undefined;
      }
    };
    const formatAgent = async (abstractAgent: AbstractAgent, format: string) => {
      // XXX finish this
      return abstractAgent;
    };
    const saveAgent = async (abstractAgent: AbstractAgent, outputFile: string, format: string) => {
      const formattedAgent = await formatAgent(abstractAgent, format);
      const s = JSON.stringify(formattedAgent, null, 2);
      if (outputFile) {
        await fs.promises.writeFile(outputFile, s);
      } else {
        console.log(s);
      }
    };
    program
      .command('create')
      .description('Create a new agent, from either a prompt or template')
      .option(`-p, --prompt <string>`, `Creation prompt`)
      .option(`--profile-picture <file>`, `Set the profile picture`)
      .option(`--home-space <file>`, `Set the home space`)
      .option(`-r, --registry <string>`, `Registry to use. ['react-agents', 'elizaos']`)
      .option(`--format <string>`, `Agent format to output`)
      .option(`-o, --output <file>`, `Output file`)
      .option(`-y, --yes`, `Non-interactive mode`)
      .option(
        `--feature <feature...>`,
        `Provide either a feature name or a JSON string with feature details. Default values are used if specifications are not provided.`
      )
      .action(async (opts = {}) => {
        // logUpstreetBanner();
        console.log(`
  Welcome to the agent insterview process.

  To exit, press CTRL+C twice.

`);
        // await handleError(async () => {
          commandExecuted = true;

          const inputStream = createReadlineInputStream();
          const outputStream = createReadlineOutputStream();
          const spinner = new Spinner();
          const registry = (() => {
            switch (opts.registry) {
              case 'elizaos':
                return new ElizaosRegistry();
              case 'react-agents':
              default:
                return new ReactAgentsRegistry();
            }
          })();
          const args = {
            prompt: opts.prompt,
            mode: ((opts.prompt || opts.yes) ? 'auto' : 'interactive') as AgentInterviewMode,
            inputStream,
            outputStream,
            processingCb: spinner.update.bind(spinner),
            profilePicture: opts.profilePicture,
            homeSpace: opts.homeSpace,
            registry,
          };

          const resultAgent = await createAgent(args);
          spinner.destroy();
          await saveAgent(resultAgent, opts.output, opts.format);
          process.exit(0);
        });
      // });
    program
      .command('edit')
      .description('Edit an existing agent')
      .argument('[inputFile]', 'Initialize from file (character card)')
      .option(`-p, --prompt <string>`, `Edit prompt`)
      .option(`--profile-picture <file>`, `Set the profile picture`)
      .option(`--home-space <file>`, `Set the home space`)
      .option(`-r, --registry <string>`, `Registry to use. ['react-agents', 'elizaos']`)
      .option(`--format <string>`, `Agent format to output`)
      .option(
        `--add, --add-feature <feature...>`,
        `Add a feature`,
      )
      .option(
        `--remove, --remove-feature <feature...>`,
        `Remove a feature`,
      )
      .action(async (inputFile, opts = {}) => {
        // await handleError(async () => {
          commandExecuted = true;

          if (!inputFile) {
            throw new Error('Input file is required');
          }

          const agent = await loadAgent(inputFile);
          const inputStream = createReadlineInputStream();
          const outputStream = createReadlineOutputStream();
          const spinner = new Spinner();
          const registry = (() => {
            switch (opts.registry) {
              case 'elizaos':
                return new ElizaosRegistry();
              case 'react-agents':
              default:
                return new ReactAgentsRegistry();
            }
          })();
          const args = {
            agent,
            prompt: opts.prompt,
            mode: ((opts.prompt || opts.yes) ? 'auto' : 'edit') as AgentInterviewMode,
            inputStream,
            outputStream,
            processingCb: spinner.update.bind(spinner),
            profilePicture: opts.profilePicture,
            homeSpace: opts.homeSpace,
            registry,
          };

          const resultAgent = await editAgent(args);
          spinner.destroy();
          await saveAgent(resultAgent, inputFile, opts.format);
          process.exit(0);
        });
      // });
  } catch (error) {
    console.error("Error creating program:", error);
  }
  return program // always return the program
};

export const main = async () => {
  dotenv.config();
  createProgram();
  try {
    await program.parseAsync();
  } catch (error) {
    console.error("Error running program:", error);
  }
};