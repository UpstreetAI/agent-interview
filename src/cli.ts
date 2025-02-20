import path from 'path';
import fs from 'fs';
import { Readable, Writable } from 'stream';

import { program } from 'commander';
import pc from 'picocolors';
import ansi from 'ansi-escapes';
import mime from 'mime/lite';
import ora from 'ora';
import { CharacterCardParser } from 'character-card-parser';
import {
  type AgentConfig,
  type AbstractRegistry,
} from './registries/registry.ts';

import { AgentInterview } from './lib/agent-interview.mjs';
import {
  ensureAgentJsonDefaults,
} from './lib/agent-json-util.mjs';
import InterviewLogger from './lib/logger/interview-logger.mjs';
import ReadlineStrategy from './lib/logger/readline.mjs';
import StreamStrategy from './lib/logger/stream.mjs';

//

// const homeDir = os.homedir();
const cwd = process.cwd();

const logAgentPropertyUpdate = (propertyName, newValue) => {
  // ANSI escape codes for colors
  const colors = {
    blue: '\x1b[34m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m'
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

export const runInterview = async (agentJson, {
  prompt,
  mode,
  inputStream,
  outputStream,
  events,
  registry,
} : {
  prompt?: string;
  mode?: string;
  inputStream?: Readable;
  outputStream?: Writable;
  events?: EventTarget;
  registry?: AbstractRegistry;
}): Promise<AgentConfig> => {
  const questionLogger = new InterviewLogger(
    inputStream && outputStream
      ? new StreamStrategy(inputStream, outputStream)
      : new ReadlineStrategy(),
  );
  
  const getAnswer = async (question) => {
    // console.log('get answer 1', {
    //   question,
    // });
    const answer = await questionLogger.askQuestion(question);
    // console.log('get answer 2', {
    //   question,
    //   answer,
    // });
    return answer;
  };
  const featureSpecs = await registry.getAllPlugins();
  const opts = {
    agentJson,
    prompt,
    mode,
    featureSpecs,
  };

  const spinner = ora({
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
  }).stop(); // initialize as stopped

  let currentSpinnerState = false;
  const updateSpinner = (isProcessing) => {
    if (isProcessing && !currentSpinnerState) {
      currentSpinnerState = true;
      spinner.start();
    } else if (!isProcessing && currentSpinnerState) {
      currentSpinnerState = false;
      spinner.stop();
    }
  };

  const agentInterview = new AgentInterview(opts);
  agentInterview.addEventListener('processingStateChange', (event) => {
    try {
      const {
        isProcessing,
      } = event.data;
      updateSpinner(isProcessing);
    } catch (error) {
      console.error('Spinner error:', error);
    }
  });
  agentInterview.addEventListener('input', async e => {
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
  agentInterview.addEventListener('output', async e => {
    const {
      text,
    } = e.data;
    // console.log('agent interview output', {
    //   text,
    // });
    questionLogger.log(text);
  });
  agentInterview.addEventListener('change', e => {
    const {
      updateObject,
      agentJson,
    } = e.data;
    // console.log('agent interview change', updateObject);
  });
  
  if (events) {
    ['preview', 'homespace'].forEach(eventType => {
      agentInterview.addEventListener(eventType, (e) => {
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

      logAgentPropertyUpdate(label, '');
    };
    agentInterview.addEventListener('preview', imageLogger('Avatar updated (preview):'));
    agentInterview.addEventListener('homespace', imageLogger('Homespace updated (preview):'));
    agentInterview.addEventListener('name', propertyLogger('name'));
    agentInterview.addEventListener('bio', propertyLogger('bio'));
    agentInterview.addEventListener('description', propertyLogger('description'));
    agentInterview.addEventListener('features', propertyLogger('features'));
  }
  const result = await agentInterview.waitForFinish();
  questionLogger.close();
  return result;
};
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
  const previewImageFile = pfpFile || inputFile;
  if (previewImageFile) {
    agentJson = await addAgentJsonImage(agentJson, previewImageFile, 'previewUrl');
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
  console.log(pc.green('Preview URL:'), agentJson.previewUrl);
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
  const previewImageFile = pfpFile || inputFile;
  if (previewImageFile) {
    agentJson = await addAgentJsonImage(agentJson, previewImageFile, 'previewUrl');
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

    // Generate the JSON string dynamically based on the examples in featureSpecs
    const featureExamples = featureSpecs.reduce((acc, feature) => {
      acc[feature.name] = feature.examples;
      return acc;
    }, {});
    const featureExamplesString = Object.entries(featureExamples)
      .map(([name, examples]) => {
        const exampleString = examples.map(example => JSON.stringify(example)).join(', ');
        return `"${name}", example using json ${exampleString}`;
      })
      .join('. ');
    const parseFeatures = (featuresSpec) => {
      let features = {};
      for (const featuresString of featuresSpec) {
        const parsedJson = jsonParse(featuresString);
        if (parsedJson !== undefined) {
          features = {
            ...features,
            ...parsedJson,
          };
        } else {
          features[featuresString] = featureExamples[featuresString][0];
        }
      }
      return features;
    };

    program
      .command('create')
      .description('Create a new agent, from either a prompt or template')
      .argument(`[directory]`, `Directory to create the project in`)
      .option(`-p, --prompt <string>`, `Creation prompt`)
      .option(`-i, --input <file>`, `Initialize from file (character card)`)
      .option(`-pfp, --profile-picture <file>`, `Set the profile picture`)
      .option(`-hs, --home-space <file>`, `Set the home space`)
      .option(`-j, --json <string>`, `Agent JSON string to initialize with (e.g '{"name": "Ally", "description": "She is cool"}')`)
      .option(`-y, --yes`, `Non-interactive mode`)
      .option(`-f, --force`, `Overwrite existing files`)
      .option(`-n, --no-install`, `Do not install dependencies`)
      .option(`-F, --force-no-confirm`, `Overwrite existing files without confirming\nUseful for headless environments. ${pc.red('WARNING: Data loss can occur. Use at your own risk.')}`)
      .option(`-s, --source <string>`, `Main source file for the agent. ${pc.red('REQUIRED: Agent Json string must be provided using -j option')}`)
      .option(
        `-feat, --feature <feature...>`,
        `Provide either a feature name or a JSON string with feature details. Default values are used if specifications are not provided. Supported features: ${pc.green(featureExamplesString)}`
      )
      .action(async (directory = undefined, opts = {}) => {
        logUpstreetBanner();
        console.log(`

  Welcome to USDK's Agent Creation process.

  ${pc.cyan(`v${packageJson.version}`)}

  To exit, press CTRL+C twice.
  If you're customizing the code for this Agent, you may need to reload this chat every time you save.

  ${pc.italic('For more information on the Agent creation process, head over to https://docs.upstreet.ai/create-an-agent#step-2-complete-the-agent-interview')}
  
`);
        await handleError(async () => {
          commandExecuted = true;
          let args;
          if (typeof directory === 'string') {
            args = {
              _: [directory],
              ...opts,
            };
          } else {
            args = {
              _: [],
              ...opts,
            };
          }

          // if features flag used, check if the feature is a valid JSON string, if so parse accordingly, else use default values
          if (opts.feature) {
            args.feature = parseFeatures(opts.feature);
          }

          const jwt = await getLoginJwt();

          await create(args, {
            jwt,
          });
        });
      });
    program
      .command('edit')
      .description('Edit an existing agent')
      .argument(`[directory]`, `Directory containing the agent to edit`)
      .option(`-p, --prompt <string>`, `Edit prompt`)
      .option(`-i, --input <file>`, `Update from file (character card)`)
      .option(`-pfp, --profile-picture <file>`, `Set the profile picture`)
      .option(`-hs, --home-space <file>`, `Set the home space`)
      .option(
        `-af, --add-feature <feature...>`,
        `Add a feature`,
      )
      .option(
        `-rf, --remove-feature <feature...>`,
        `Remove a feature`,
      )
      .action(async (directory = undefined, opts = {}) => {
        await handleError(async () => {
          commandExecuted = true;
          let args;
          if (typeof directory === 'string') {
            args = {
              _: [directory],
              ...opts,
            };
          } else {
            args = {
              _: [],
              ...opts,
            };
          }

          if (opts.addFeature) {
            args.addFeature = parseFeatures(opts.addFeature);
          }

          const jwt = await getLoginJwt();

          await edit(args, {
            jwt,
          });
        });
      });
  } catch (error) {
    console.error("Error creating program:", error);
  }
  return program // always return the program
};

export const main = async () => {
  createProgram();
  try {
    await program.parseAsync();
  } catch (error) {
    console.error("Error running program:", error);
  }
};