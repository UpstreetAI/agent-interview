#!/usr/bin/env -S node --no-warnings

// src/cli.ts
import path from "path";
import fs from "fs";
import { program } from "commander";
import pc from "picocolors";
import ansi from "ansi-escapes";
import mime from "mime/lite";
import ora from "ora";
import { CharacterCardParser } from "character-card-parser";

// src/lib/agent-interview.mjs
import dedent3 from "dedent";
import { z as z3 } from "zod";

// src/lib/interactor.js
import { z } from "zod";
import dedent from "dedent";
import { QueueManager } from "queue-manager-async";

// src/constants.mjs
var defaultModels = [
  "openai:gpt-4o-2024-08-06",
  "anthropic:claude-3-5-sonnet-20240620",
  "openrouter:nousresearch/hermes-3-llama-3.1-405b",
  "openrouter:nousresearch/hermes-3-llama-3.1-70b",
  "openrouter:google/gemini-2.0-flash-exp:free"
];
var defaultSmallModels = [
  "openai:gpt-4o-mini"
];
var defaultLargeModels = [
  "openai:o1-preview"
];
var currencies = ["usd"];
var intervals = ["month", "year", "week", "day"];
var consoleImagePreviewWidth = 24 * 2;

// src/lib/generate-text.mjs
import { zodResponseFormat } from "openai/helpers/zod";
var getTextGenerationConfig = () => {
  return {
    model: defaultModels[0],
    key: process.env.OPENAI_API_KEY
  };
};
var fetchJsonCompletion = async (opts, format) => {
  const {
    model = defaultModels[0],
    key = null,
    messages,
    stream
  } = opts ?? {};
  const response_format = format && zodResponseFormat(format, "result");
  const u = `https://api.openai.com/v1/chat/completions`;
  const res = await fetch(u, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`
    },
    body: JSON.stringify({
      model,
      messages,
      response_format,
      stream
    })
  });
  if (res.ok) {
    const j = await res.json();
    let content = j.choices[0].message.content;
    if (format) {
      content = JSON.parse(content);
    }
    return content;
  } else {
    const text = await res.text();
    throw new Error("error response in fetch completion: " + res.status + ": " + text);
  }
};

// src/lib/interactor.js
var makeCleanObjectFromSchema = (object, schema) => {
  if (schema && typeof schema === "object" && schema._def && schema._def.typeName === "ZodObject") {
    const shape = schema.shape;
    const result = structuredClone(object);
    for (const key in shape) {
      if (result[key] === void 0) {
        result[key] = object[key];
      }
    }
    return result;
  } else {
    throw new Error("invalid schema");
  }
};
var makeEmptyObjectFromSchema = (schema) => {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const result = {};
    for (const key in shape) {
      result[key] = null;
    }
    return result;
  } else {
    throw new Error("invalid schema");
  }
};
var Interactor = class extends EventTarget {
  jwt;
  object;
  objectFormat;
  formatFn;
  messages;
  queueManager;
  #isProcessing;
  constructor({
    systemPrompt,
    userPrompt,
    object,
    objectFormat,
    formatFn = (o) => o,
    jwt
  }) {
    super();
    this.jwt = jwt;
    this.object = object ? makeCleanObjectFromSchema(object, objectFormat) : makeEmptyObjectFromSchema(objectFormat);
    this.objectFormat = objectFormat;
    this.formatFn = formatFn;
    this.messages = [
      {
        role: "system",
        content: dedent`\
            You are an interactive configuration assistant designed to update a JSON configuration object on behalf of the user.
            Prompt the user for a question you need answered to update the configuration object.
            Be informal and succinct; do not directly ask for the fields. Hide the complexity and internal state, and auto-fill details where you can.
            Feel free to use artistic license or ask clarifying questions.
            
            Reply with a JSON object including a response to the user, an optional update object to merge with the existing one, and a done flag when you think it's time to end the conversation.
          ` + "\n\n" + dedent`\
            # Instructions
          ` + "\n" + systemPrompt + "\n\n" + dedent`\
            # Initial state
          ` + "\n" + JSON.stringify(this.object, null, 2)
      }
    ];
    if (userPrompt) {
      this.messages.push({
        role: "user",
        content: userPrompt
      });
    }
    this.queueManager = new QueueManager();
    this.#isProcessing = false;
  }
  get isProcessing() {
    return this.#isProcessing;
  }
  #setProcessingState(isProcessing) {
    this.#isProcessing = isProcessing;
    this.dispatchEvent(new MessageEvent("processingStateChange", {
      data: { isProcessing }
    }));
  }
  async write(text = "") {
    return await this.queueManager.waitForTurn(async () => {
      try {
        this.#setProcessingState(true);
        const { jwt, objectFormat, object, messages } = this;
        if (text) {
          messages.push({
            role: "user",
            content: text
          });
        }
        const o = await fetchJsonCompletion({
          model: defaultModels[0],
          messages,
          ...getTextGenerationConfig()
        }, z.object({
          response: z.string(),
          updateObject: z.union([
            objectFormat,
            z.null()
          ]),
          done: z.boolean()
        }), {
          jwt
        });
        const updateObject = this.formatFn(o.updateObject);
        if (updateObject) {
          for (const key in updateObject) {
            object[key] = updateObject[key];
          }
        }
        {
          const content = JSON.stringify(o, null, 2);
          const responseMessage = {
            role: "assistant",
            content
          };
          messages.push(responseMessage);
        }
        this.dispatchEvent(new MessageEvent("message", {
          data: {
            ...o,
            object
          }
        }));
      } finally {
        this.#setProcessingState(false);
      }
    });
  }
  async end(text = "") {
    return await this.queueManager.waitForTurn(async () => {
      try {
        this.#setProcessingState(true);
        const { jwt, objectFormat, object, messages } = this;
        if (text) {
          messages.push({
            role: "user",
            content: text
          });
        }
        let o = await fetchJsonCompletion({
          model: defaultModels[0],
          messages,
          ...getTextGenerationConfig()
        }, z.object({
          output: objectFormat
        }), {
          jwt
        });
        o = {
          response: "",
          updateObject: o.output,
          done: true
        };
        const updateObject = this.formatFn(o.updateObject);
        if (updateObject) {
          for (const key in updateObject) {
            object[key] = updateObject[key];
          }
        }
        {
          const content = JSON.stringify(o, null, 2);
          const responseMessage = {
            role: "assistant",
            content
          };
          messages.push(responseMessage);
        }
        this.dispatchEvent(new MessageEvent("message", {
          data: {
            ...o,
            object
          }
        }));
      } finally {
        this.#setProcessingState(false);
      }
    });
  }
};

// src/lib/value-updater.js
var ValueUpdater = class extends EventTarget {
  lastValue;
  onChangeFn = async (result, { signal }) => {
  };
  abortController = null;
  loadPromise = null;
  constructor(onChangeFn) {
    super();
    this.onChangeFn = onChangeFn;
  }
  set(value) {
    if (value !== this.lastValue) {
      this.lastValue = value;
      if (this.abortController) {
        this.abortController.abort();
        this.abortController = null;
      }
      this.abortController = new AbortController();
      {
        const { signal } = this.abortController;
        this.loadPromise = this.onChangeFn(value, { signal });
        (async () => {
          const result = await this.loadPromise;
          this.dispatchEvent(new MessageEvent("change", {
            data: {
              result,
              signal
            }
          }));
        })();
      }
    }
  }
  setResult(result) {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.loadPromise = Promise.resolve(result);
  }
  async waitForLoad() {
    return await this.loadPromise;
  }
};

// src/lib/generate-image.mjs
import * as fal from "@fal-ai/serverless-client";
import {
  base64toBlob
} from "base64-universal";
var getImageGenerationConfig = () => {
  let model;
  let key;
  if (process.env.FAL_KEY) {
    model = "black-forest-labs:flux";
    key = process.env.FAL_KEY;
  } else if (process.env.OPENAI_API_KEY) {
    model = "openai:dall-e-3";
    key = process.env.OPENAI_API_KEY;
  } else {
    throw new Error("no key");
  }
  return {
    model,
    key
  };
};
var generateFlux = async ({
  prompt,
  image_size,
  num_inference_steps,
  seed,
  guidance_scale,
  num_images,
  sync_mode = true,
  enable_safety_checker = false,
  key
}) => {
  fal.config({
    credentials: key
  });
  const result = await fal.subscribe("fal-ai/flux/dev", {
    input: {
      prompt,
      image_size,
      num_inference_steps,
      seed,
      guidance_scale,
      num_images,
      sync_mode,
      enable_safety_checker
    },
    logs: true,
    onQueueUpdate: (update) => {
      if (update.status === "IN_PROGRESS") {
        update.logs.map((log) => log.message).forEach(console.log);
      }
    }
  });
  const { images, timings, seed: outputSeed, has_nsfw_concepts } = result;
  const image = images[0];
  const { url, content_type } = image;
  const blob = base64toBlob(url, content_type);
  blob.seed = outputSeed + "";
  return blob;
};
var fetchImageGeneration = async (opts) => {
  const {
    model = "black-forest-labs:flux",
    key = null,
    prompt,
    image_size = "landscape_4_3"
    // "square_hd", "square", "portrait_4_3", "portrait_16_9", "landscape_4_3", "landscape_16_9"
  } = opts ?? {};
  if (model === "black-forest-labs:flux") {
    const blob = await generateFlux({
      prompt,
      image_size,
      key
    });
    return blob;
  } else if (model === "openai:dall-e-3") {
    const {
      width = 1024,
      // [1024, 1792]
      height = 1024,
      quality = "hd"
      // ['hd', 'standard']
    } = opts ?? {};
    const u = `https://api.openai.com/v1/images/generations`;
    const j = {
      prompt,
      model: "dall-e-3",
      size: `${width}x${height}`,
      quality,
      n: 1
    };
    const res = await fetch(u, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify(j)
    });
    if (res.ok) {
      const blob = await res.blob();
      return blob;
    } else {
      const text = await res.text();
      console.log("got generate image error", text);
      throw new Error(`image generation error: ${text}`);
    }
  } else {
    throw new Error("unknown image generation model: " + model);
  }
};
var characterImageSizeFlux = "portrait_4_3";
var generateCharacterImage = async (prompt, opts) => {
  const {
    stylePrompt = `full body shot, front view, facing viewer, standing straight, arms at side, neutral expression, high resolution, flcl anime style`,
    seed,
    guidance_scale
  } = opts ?? {};
  const fullPrompt = [
    stylePrompt,
    prompt
  ].filter(Boolean).join("\n");
  const blob = await fetchImageGeneration({
    prompt: fullPrompt,
    image_size: characterImageSizeFlux,
    seed,
    guidance_scale,
    ...getImageGenerationConfig()
  });
  return {
    fullPrompt,
    blob
  };
};
var backgroundImageSizeFlux = "square_hd";
var generateBackgroundImage = async (prompt, opts) => {
  const {
    stylePrompt = `flcl anime style background art`,
    seed,
    guidance_scale
  } = opts ?? {};
  const fullPrompt = [
    stylePrompt,
    prompt
  ].filter(Boolean).join("\n");
  const blob = await fetchImageGeneration({
    prompt: fullPrompt,
    image_size: backgroundImageSizeFlux,
    seed,
    guidance_scale,
    ...getImageGenerationConfig()
  });
  return {
    fullPrompt,
    blob
  };
};

// src/lib/agent-features-spec.mjs
import { z as z2 } from "zod";
import dedent2 from "dedent";
var paymentPropsType = z2.object({
  name: z2.string(),
  description: z2.string().optional(),
  amount: z2.number().int(),
  currency: z2.enum(currencies)
});
var paymentItemType = z2.object({
  type: z2.literal("payment"),
  props: paymentPropsType
});
var subscriptionPropsType = z2.object({
  name: z2.string(),
  description: z2.string().optional(),
  amount: z2.number().int(),
  currency: z2.enum(currencies),
  interval: z2.enum(intervals),
  intervalCount: z2.number()
});
var subscriptionItemType = z2.object({
  type: z2.literal("subscription"),
  props: subscriptionPropsType
});
var storeItemType = z2.union([
  paymentItemType,
  subscriptionItemType
]);
var defaultVoices = [
  {
    voiceEndpoint: "elevenlabs:kadio:YkP683vAWY3rTjcuq2hX",
    name: "Kaido",
    description: "Teenage anime boy"
  },
  {
    voiceEndpoint: "elevenlabs:drake:1thOSihlbbWeiCGuN5Nw",
    name: "Drake",
    description: "Anime male"
  },
  {
    voiceEndpoint: "elevenlabs:terrorblade:lblRnHLq4YZ8wRRUe8ld",
    name: "Terrorblade",
    description: "Monstrous male"
  },
  {
    voiceEndpoint: "elevenlabs:scillia:kNBPK9DILaezWWUSHpF9",
    name: "Scillia",
    description: "Teenage anime girl"
  },
  {
    voiceEndpoint: "elevenlabs:mommy:jSd2IJ6Fdd2bD4TaIeUj",
    name: "Mommy",
    description: "Anime female"
  },
  {
    voiceEndpoint: "elevenlabs:uni:PSAakCTPE63lB4tP9iNQ",
    name: "Uni",
    description: "Waifu girl"
  }
];
var featureSpecs2 = [
  {
    name: "tts",
    description: dedent2`\
      Text to speech.
      Available voice endpoints:
    ` + "\n" + defaultVoices.map((v) => `* ${JSON.stringify(v.name)}: ${v.voiceEndpoint}`).join("\n"),
    schema: z2.union([
      z2.object({
        voiceEndpoint: z2.enum(defaultVoices.map((v) => v.voiceEndpoint))
      }),
      z2.null()
    ]),
    examples: [{ voiceEndpoint: defaultVoices[0].voiceEndpoint }],
    // For Web UI
    displayIcon: "Voice",
    displayName: "Voice",
    displayDescription: "Select a voice for your agent.",
    form: {
      voiceEndpoint: {
        type: "select",
        label: "Voice",
        description: "Select a voice for your agent.",
        options: defaultVoices.map((v) => ({ value: v.voiceEndpoint, label: v.name })),
        defaultValue: defaultVoices[0].voiceEndpoint
      }
    },
    // Feature in development ( true, false )
    dev: false
  },
  {
    name: "rateLimit",
    description: dedent2`\
      Agent is publicly available.
      The rate limit is \`maxUserMessages\` messages per \`maxUserMessagesTime\` milliseconds.
      When the rate limit is exceeded, the agent will respond with the static \`message\`.
      If either \`maxUserMessages\` or \`maxUserMessagesTime\` is not provided or zero, the rate limit is disabled.
    ` + "\n" + defaultVoices.map((v) => `* ${JSON.stringify(v.name)}: ${v.voiceEndpoint}`).join("\n"),
    schema: z2.union([
      z2.object({
        maxUserMessages: z2.number().optional(),
        maxUserMessagesTime: z2.number().optional(),
        message: z2.string().optional()
      }),
      z2.null()
    ]),
    examples: [{ maxUserMessages: 5, maxUserMessagesTime: 6e4, message: "Whoa there! Take a moment." }],
    // For Web UI
    displayIcon: "Chat",
    displayName: "Rate Limit",
    displayDescription: "Control how often users can message the agent.",
    form: {
      maxUserMessages: {
        type: "number",
        label: "Max User Messages",
        description: "The maximum number of messages a user can send to the agent.",
        defaultValue: 5
      },
      maxUserMessagesTime: {
        type: "number",
        label: "Max User Messages Time",
        description: "The time in milliseconds after which a user can send another message to the agent.",
        defaultValue: 60 * 60 * 24 * 1e3
        // 1 day
      },
      message: {
        type: "text",
        label: "Message",
        description: "The message to send to the agent when the rate limit is exceeded.",
        defaultValue: "Whoa there! Take a moment."
      }
    },
    // Feature in development ( true, false )
    dev: false
  },
  {
    name: "discord",
    description: dedent2`\
      Add Discord integration to the agent. Add this feature only when the user explicitly requests it and provides a bot token.

      The user should follow these instructions to set up their bot (you can instruct them to do this):
      - Create a bot application at https://discord.com/developers/applications and note the CLIENT_ID (also called "application id")
      - Enable Privileged Gateway Intents at https://discord.com/developers/applications/CLIENT_ID/bot
      - Add the bot to your server at https://discord.com/oauth2/authorize/?permissions=-2080908480&scope=bot&client_id=CLIENT_ID
      - Get the bot token at https://discord.com/developers/applications/CLIENT_ID/bot
      The token is required and must be provided.

      \`channels\` is a list of channel names (text or voice) that the agent should join.
    `,
    schema: z2.union([
      z2.object({
        token: z2.string(),
        channels: z2.array(z2.string())
      }),
      z2.null()
    ]),
    examples: [{ token: "YOUR_DISCORD_BOT_TOKEN", channels: ["general", "voice"] }],
    // For Web UI
    displayIcon: "Discord",
    displayName: "Discord",
    displayDescription: "Connect your agent to Discord.",
    form: {
      token: {
        type: "text",
        label: "Token",
        description: "The token for your Discord bot.",
        defaultValue: ""
      },
      channels: {
        type: "text",
        label: "Channels",
        description: "The channels to join.",
        options: [
          { value: "general", label: "General" },
          { value: "voice", label: "Voice" }
        ],
        defaultValue: []
      }
    },
    // Feature in development ( true, false )
    dev: false
  },
  {
    name: "twitterBot",
    description: dedent2`\
      Add a Twitter bot to the agent.

      The API token is required.
    `,
    schema: z2.union([
      z2.object({
        token: z2.string()
      }),
      z2.null()
    ]),
    examples: [{ token: "YOUR_TWITTER_BOT_TOKEN" }],
    // For Web UI
    displayIcon: "X",
    displayName: "X (Twitter)",
    displayDescription: "Add a Twitter bot to your agent.",
    form: {
      token: {
        type: "text",
        label: "Token",
        description: "The token for your Twitter bot.",
        defaultValue: ""
      }
    },
    // Feature in development ( true, false )
    dev: false
  },
  {
    name: "telnyx",
    description: dedent2`\
      Add Telnyx phone call/SMS support to the agent. Add this feature only when the user explicitly requests it and provides an api key.

      Phone number is optional, but if provided must be in +E.164 format (e.g. +14151234567).
    `,
    schema: z2.union([
      z2.object({
        apiKey: z2.string(),
        phoneNumber: z2.string().optional(),
        message: z2.boolean(),
        voice: z2.boolean()
      }),
      z2.null()
    ]),
    examples: [{ apiKey: "YOUR_TELNYX_API_KEY", phoneNumber: "+14151234567", message: true, voice: true }],
    // For Web UI
    displayIcon: "Upstreet",
    displayName: "Telnyx",
    displayDescription: "Enable phone call and SMS support for your agent.",
    // Form
    form: {
      apiKey: {
        type: "text",
        label: "API Key",
        description: "The API key for your Telnyx account.",
        defaultValue: ""
      },
      phoneNumber: {
        type: "text",
        label: "Phone Number",
        description: "The phone number to use for Telnyx.",
        defaultValue: ""
      },
      message: {
        type: "checkbox",
        label: "Message",
        description: "Enable message support.",
        defaultValue: false
      },
      voice: {
        type: "checkbox",
        label: "Voice",
        description: "Enable voice support.",
        defaultValue: false
      }
    },
    // Feature in development ( true, false )
    dev: true
  },
  {
    name: "storeItems",
    description: dedent2`\
      List of items that can be purchased from the agent, with associated prices.
      \`amount\` in cents (e.g. 100 = $1).
    `,
    schema: z2.union([
      z2.array(storeItemType),
      z2.null()
    ]),
    examples: [{ type: "payment", props: { name: "Art", description: "An art piece", amount: 499, currency: "usd" } }],
    // Default values
    default: [
      {
        type: "payment",
        props: {
          name: "",
          description: "",
          amount: 100,
          currency: currencies[0],
          interval: intervals[0],
          intervalCount: 1
        }
      }
    ],
    // For Web UI
    displayIcon: "ModuleStore",
    displayName: "Store",
    displayDescription: "Manage items your agent can sell.",
    form: {
      items: {
        type: "array",
        label: "Items",
        description: "The items to sell.",
        defaultValue: []
      }
    },
    // Feature in development ( true, false )
    dev: true
  }
];

// src/lib/agent-interview.mjs
var makePromise = () => {
  const {
    promise,
    resolve,
    reject
  } = Promise.withResolvers();
  promise.resolve = resolve;
  promise.reject = reject;
  return promise;
};
var processFeatures = (agentJson) => {
  const userSpecifiedFeatures = new Set(Object.keys(agentJson.features || {}));
  const validFeatures = new Set(featureSpecs2.map((spec) => spec.name));
  for (const feature of userSpecifiedFeatures) {
    if (!validFeatures.has(feature)) {
      throw new Error(`Invalid features specified: ${feature}`);
    }
  }
  const allowAll = userSpecifiedFeatures.size === 0;
  const result = {};
  for (const featureSpec of featureSpecs2) {
    const { name, schema } = featureSpec;
    if (allowAll || userSpecifiedFeatures.has(name)) {
      result[name] = schema.optional();
    }
  }
  return {
    result,
    userSpecifiedFeatures,
    allowAll
  };
};
var generateFeaturePrompt = (featureSpecs3, userSpecifiedFeatures, allowAll) => {
  const prompt = allowAll ? dedent3`\
      The available features are:
    ` + "\n" + featureSpecs3.map(({ name, description }) => {
    return `# ${name}
${description}`;
  }).join("\n") + "\n\n" : dedent3`\
      The agent is given the following features:
    ` + "\n" + Array.from(userSpecifiedFeatures).map((feature) => {
    const spec = featureSpecs3.find((spec2) => spec2.name === feature);
    return spec ? `# ${spec.name}
${spec.description}` : `# ${feature}
Description not available.`;
  }).join("\n") + "\n\n";
  return prompt;
};
var AgentInterview = class extends EventTarget {
  constructor(opts) {
    super();
    let {
      agentJson,
      // object
      prompt,
      // string
      mode,
      // 'auto' | 'interactive' | 'manual'
      jwt
    } = opts;
    const { result: featureSchemas, userSpecifiedFeatures, allowAll } = processFeatures(agentJson);
    const featuresAvailablePrompt = generateFeaturePrompt(featureSpecs2, userSpecifiedFeatures, allowAll);
    const visualDescriptionValueUpdater = new ValueUpdater(async (visualDescription, {
      signal
    }) => {
      const {
        blob
      } = await generateCharacterImage(visualDescription, void 0, {
        jwt
      });
      return blob;
    });
    visualDescriptionValueUpdater.addEventListener("change", async (e) => {
      this.dispatchEvent(new MessageEvent("preview", {
        data: e.data
      }));
    });
    const homespaceDescriptionValueUpdater = new ValueUpdater(async (homespaceDescription, {
      signal
    }) => {
      const {
        blob
      } = await generateBackgroundImage(homespaceDescription, void 0, {
        jwt
      });
      return blob;
    });
    homespaceDescriptionValueUpdater.addEventListener("change", async (e) => {
      this.dispatchEvent(new MessageEvent("homespace", {
        data: e.data
      }));
    });
    const pumpIo = (response = "") => {
      this.dispatchEvent(new MessageEvent("input", {
        data: {
          question: response
        }
      }));
    };
    const sendOutput = (text) => {
      this.dispatchEvent(new MessageEvent("output", {
        data: {
          text
        }
      }));
    };
    this.loadPromise = makePromise();
    if (agentJson.previewUrl) {
      visualDescriptionValueUpdater.setResult(agentJson.previewUrl);
    }
    if (agentJson.homespaceUrl) {
      homespaceDescriptionValueUpdater.setResult(agentJson.homespaceUrl);
    }
    this.interactor = new Interactor({
      systemPrompt: dedent3`\
          Configure an AI agent as specified by the user.
          
          \`name\`, \`bio\`, \`description\`, and \`visualDescription\` describe the character.
          \`bio\` describes the personality and character traits of the agent.
          \`description\` explains why other agents or users would want to interact with this agent. Keep it intriguing and concise.
          \`visualDescription\` visually describes the character without referring to their pose or emotion. This is an image prompt to use for an image generator. Update it whenever the character's visual description changes.
          e.g. 'girl with medium blond hair and blue eyes, purple dress, green hoodie, jean shorts, sneakers'
          \`homespacecDescription\` visually describe the character's homespace. This is also an image prompt, meant to describe the natural habitat of the character. Update it whenever the character's homespace changes.
          e.g. 'neotokyo, sakura trees, neon lights, path, ancient ruins, jungle, lush curved vine plants'
          \`private\` is a boolean that determines whether the agent is private (true) or public (false).

          Do not use placeholder values for fields and do not copy the above examples. Instead, make up something unique and appropriate for the character.
          ${mode == "auto" ? `When you think the session is over, set the \`done\` flag.` : `When you think the session is over, then set the \`done\` flag. You might want to confirm with the user beforehand.`}
        ` + "\n\n" + featuresAvailablePrompt,
      userPrompt: prompt,
      object: agentJson,
      objectFormat: z3.object({
        name: z3.string().optional(),
        bio: z3.string().optional(),
        description: z3.string().optional(),
        visualDescription: z3.string().optional(),
        homespaceDescription: z3.string().optional(),
        features: z3.object(featureSchemas).optional(),
        private: z3.boolean().optional()
      }),
      formatFn: (updateObject) => {
        updateObject = structuredClone(updateObject);
        if (updateObject == null ? void 0 : updateObject.features) {
          for (const featureName in updateObject.features) {
            const value = updateObject.features[featureName];
            if (value === null || value === void 0) {
              delete updateObject.features[featureName];
            }
          }
        }
        return updateObject;
      },
      jwt
    });
    this.interactor.addEventListener("processingStateChange", (event) => {
      this.dispatchEvent(new MessageEvent("processingStateChange", {
        data: event.data
      }));
    });
    this.interactor.addEventListener("message", async (e) => {
      const o = e.data;
      const {
        response,
        updateObject,
        done,
        object
      } = o;
      agentJson = object;
      if (updateObject) {
        const hasNonNullValues = (obj) => Object.values(obj).some((value) => value !== null && value !== void 0);
        const shouldDispatchProperty = (key, value) => {
          if (key === "visualDescription" || key === "homespaceDescription") {
            return false;
          }
          if (key === "features" && typeof value === "object") {
            return hasNonNullValues(value);
          }
          return value !== null && value !== void 0;
        };
        Object.entries(updateObject).filter(([key, value]) => shouldDispatchProperty(key, value)).forEach(([key, value]) => {
          this.dispatchEvent(new MessageEvent(key, {
            data: value
          }));
        });
        this.dispatchEvent(new MessageEvent("change", {
          data: {
            updateObject,
            agentJson
          }
        }));
      }
      if (updateObject == null ? void 0 : updateObject.visualDescription) {
        visualDescriptionValueUpdater.set(updateObject.visualDescription);
      }
      if (updateObject == null ? void 0 : updateObject.homespaceDescription) {
        homespaceDescriptionValueUpdater.set(updateObject.homespaceDescription);
      }
      if (!done) {
        pumpIo(response);
      } else {
        response && sendOutput(response);
        const getPreviewUrl = async (valueUpdater) => {
          const result = await valueUpdater.waitForLoad();
          if (typeof result === "string") {
            return result;
          } else if (result instanceof Blob) {
            const guid = crypto.randomUUID();
            const p = ["avatars", guid, `image.jpg`].join("/");
            return await uploadBlob(p, result, {
              jwt
            });
          } else if (result === null) {
            return "";
          } else {
            console.warn("invalid result type", result);
            throw new Error("invalid result type: " + typeof result);
          }
        };
        [
          agentJson.previewUrl,
          agentJson.homespaceUrl
        ] = await Promise.all([
          getPreviewUrl(visualDescriptionValueUpdater),
          getPreviewUrl(homespaceDescriptionValueUpdater)
        ]);
        this.loadPromise.resolve(agentJson);
      }
    });
    setTimeout(() => {
      if (mode === "auto") {
        this.interactor.end();
      } else if (mode === "interactive") {
        pumpIo("What do you want your agent to do?");
      } else if (mode === "edit") {
        pumpIo("What edits do you want to make?");
      } else if (mode === "manual") {
      } else {
        throw new Error(`invalid mode: ${mode}`);
      }
    }, 0);
  }
  write(response) {
    this.interactor.write(response);
  }
  async waitForFinish() {
    return await this.loadPromise;
  }
};

// src/lib/agent-json-util.mjs
var ensureAgentJsonDefaults = (spec) => {
  spec = {
    ...spec
  };
  if (typeof spec.name !== "string" || !spec.name) {
    const suffix = Math.floor(1e4 + Math.random() * 9e4);
    spec.name = `AI Agent ${suffix}`;
  }
  if (typeof spec.description !== "string" || !spec.description) {
    spec.description = "Created by the AI Agent SDK";
  }
  if (typeof spec.bio !== "string" || !spec.bio) {
    spec.bio = "A cool AI";
  }
  if (typeof spec.model !== "string" || !spec.model) {
    spec.model = defaultModels[0];
  }
  if (typeof spec.smallModel !== "string" || !spec.smallModel) {
    spec.smallModel = defaultSmallModels[0];
  }
  if (typeof spec.largeModel !== "string" || !spec.largeModel) {
    spec.largeModel = defaultLargeModels[0];
  }
  if (typeof spec.previewUrl !== "string" || !spec.previewUrl) {
    spec.previewUrl = "";
  }
  if (typeof spec.avatarUrl !== "string" || !spec.avatarUrl) {
    spec.avatarUrl = "";
  }
  if (typeof spec.homespaceUrl !== "string" || !spec.homespaceUrl) {
    spec.homespaceUrl = "";
  }
  if (typeof spec.voiceEndpoint !== "string" || !spec.voiceEndpoint) {
    spec.voiceEndpoint = "elevenlabs:scillia:kNBPK9DILaezWWUSHpF9";
  }
  return spec;
};

// src/lib/logger/interview-logger.mjs
var InterviewLogger = class {
  constructor(strategy) {
    this.strategy = strategy;
  }
  askQuestion(question) {
    return this.strategy.askQuestion(question);
  }
  log(...args) {
    return this.strategy.log(...args);
  }
  close() {
    this.strategy.close();
  }
};
var interview_logger_default = InterviewLogger;

// src/lib/logger/readline.mjs
import readline from "readline";
var ReadlineStrategy = class {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }
  async askQuestion(question) {
    for (; ; ) {
      const answer = await new Promise((resolve) => {
        this.rl.question(`\x1B[32m?\x1B[0m \x1B[1m${question}\x1B[0m
`, (answer2) => {
          resolve(answer2.trim());
        });
      });
      if (answer) {
        return answer;
      }
    }
  }
  log(...args) {
    console.log(...args);
  }
  close() {
    this.rl.close();
  }
};
var readline_default = ReadlineStrategy;

// src/lib/logger/stream.mjs
import readline2 from "readline";
import util from "util";
var StreamStrategy = class {
  constructor(inputStream, outputStream) {
    this.rl = readline2.createInterface({
      input: inputStream,
      output: outputStream
    });
  }
  async askQuestion(question) {
    for (; ; ) {
      const answer = await new Promise((resolve) => {
        this.rl.question(
          question,
          (answer2) => {
            resolve(answer2.trim());
          }
        );
      });
      if (answer) {
        return answer;
      }
    }
  }
  log(...args) {
    const formattedArgs = args.map((arg) => {
      if (typeof arg === "string") {
        return arg;
      } else {
        return util.inspect(arg, {
          depth: 3
          // colors: true,
        });
      }
    });
    this.rl.output.write(formattedArgs.join(" ") + "\n");
  }
  close() {
    this.rl.close();
  }
};
var stream_default = StreamStrategy;

// src/cli.ts
var cwd = process.cwd();
var logAgentPropertyUpdate = (propertyName, newValue) => {
  const colors = {
    blue: "\x1B[34m",
    green: "\x1B[32m",
    yellow: "\x1B[33m",
    cyan: "\x1B[36m",
    reset: "\x1B[0m",
    bold: "\x1B[1m",
    dim: "\x1B[2m"
  };
  if (typeof newValue === "object" && newValue !== null) {
    console.log(`${colors.blue}${colors.bold}[AGENT UPDATE]${colors.reset} ${colors.cyan}${propertyName}${colors.reset}`);
    Object.entries(newValue).forEach(([key, value]) => {
      if (value !== null && value !== void 0) {
        console.log(`  ${colors.dim}\u2192${colors.reset} ${colors.yellow}${key}${colors.reset}: ${colors.green}${value}${colors.reset}`);
      }
    });
  } else {
    console.log(
      `${colors.blue}${colors.bold}[AGENT UPDATE]${colors.reset} ${colors.cyan}${propertyName}${colors.reset} ${colors.dim}\u2192${colors.reset} ${colors.green}${newValue}${colors.reset}`
    );
  }
};
var propertyLogger = (prefix) => (e) => {
  logAgentPropertyUpdate(prefix, e.data);
};
var cliInterview = async (agentJson, {
  prompt,
  mode,
  inputStream,
  outputStream,
  events,
  jwt
}) => {
  const questionLogger = new interview_logger_default(
    inputStream && outputStream ? new stream_default(inputStream, outputStream) : new readline_default()
  );
  const getAnswer = async (question) => {
    const answer = await questionLogger.askQuestion(question);
    return answer;
  };
  const opts = {
    agentJson,
    prompt,
    mode,
    jwt
  };
  const spinner = ora({
    text: "",
    spinner: {
      interval: 80,
      frames: [
        "\u25CF\u2219\u2219\u2219",
        "\u2219\u25CF\u2219\u2219",
        "\u2219\u2219\u25CF\u2219",
        "\u2219\u2219\u2219\u25CF",
        "\u2219\u2219\u2219\u2219"
      ]
    },
    discardStdin: false
  }).stop();
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
  agentInterview.addEventListener("processingStateChange", (event) => {
    try {
      const {
        isProcessing
      } = event.data;
      updateSpinner(isProcessing);
    } catch (error) {
      console.error("Spinner error:", error);
    }
  });
  agentInterview.addEventListener("input", async (e) => {
    const {
      question
    } = e.data;
    const answer = await getAnswer(question);
    agentInterview.write(answer);
  });
  agentInterview.addEventListener("output", async (e) => {
    const {
      text
    } = e.data;
    questionLogger.log(text);
  });
  agentInterview.addEventListener("change", (e) => {
    const {
      updateObject,
      agentJson: agentJson2
    } = e.data;
  });
  if (events) {
    ["preview", "homespace"].forEach((eventType) => {
      agentInterview.addEventListener(eventType, (e) => {
        events.dispatchEvent(new MessageEvent(eventType, {
          data: e.data
        }));
      });
    });
  } else {
    const imageLogger = (label) => async (e) => {
      const {
        result: blob,
        signal
      } = e.data;
      const ab = await blob.arrayBuffer();
      if (signal.aborted) return;
      logAgentPropertyUpdate(label, "");
    };
    agentInterview.addEventListener("preview", imageLogger("Avatar updated (preview):"));
    agentInterview.addEventListener("homespace", imageLogger("Homespace updated (preview):"));
    agentInterview.addEventListener("name", propertyLogger("name"));
    agentInterview.addEventListener("bio", propertyLogger("bio"));
    agentInterview.addEventListener("description", propertyLogger("description"));
    agentInterview.addEventListener("features", propertyLogger("features"));
  }
  const result = await agentInterview.waitForFinish();
  questionLogger.close();
  return result;
};
var getAgentJsonFromCharacterCard = async (p) => {
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
    extensions
  } = parsed.data;
  return {
    name,
    description,
    bio: personality
  };
};
var addAgentJsonImage = async (agentJson, p, key) => {
  const base64 = await fs.promises.readFile(p, "base64");
  const mimeType = mime.getType(p) || "application/octet-stream";
  const url = `data:${mimeType};base64,${base64}`;
  agentJson = {
    ...agentJson,
    [key]: url
  };
};
var addAgentJsonFeatures = (agentJson, features) => {
  agentJson = {
    ...agentJson
  };
  if (Object.keys(features).length > 0) {
    agentJson.features = {
      ...features
    };
  }
  return agentJson;
};
var loadAgentJson = (dstDir) => {
  const agentJsonPath = path.join(dstDir, "agent.json");
  const agentJsonString = fs.readFileSync(agentJsonPath, "utf8");
  const agentJson = JSON.parse(agentJsonString);
  return agentJson;
};
var create = async (args, opts) => {
  let dstDir = args._[0] ?? "";
  const prompt = args.prompt ?? "";
  const inputStream = args.inputStream ?? null;
  const outputStream = args.outputStream ?? null;
  const events = args.events ?? null;
  const inputFile = args.input ?? null;
  const pfpFile = args.profilePicture ?? null;
  const hsFile = args.homeSpace ?? null;
  const agentJsonString = args.json;
  const features = typeof args.feature === "string" ? JSON.parse(args.feature) : args.feature || {};
  const yes = args.yes;
  const jwt = opts.jwt;
  if (!jwt) {
    throw new Error("You must be logged in to create an agent.");
  }
  console.log(pc.italic("Generating Agent..."));
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
  const previewImageFile = pfpFile || inputFile;
  if (previewImageFile) {
    agentJson = await addAgentJsonImage(agentJson, previewImageFile, "previewUrl");
  }
  if (hsFile) {
    agentJson = await addAgentJsonImage(agentJson, hsFile, "homespaceUrl");
  }
  agentJson = addAgentJsonFeatures(agentJson, features);
  if (!initialAgentJson && !yes) {
    const interviewMode = prompt ? "auto" : "interactive";
    if (interviewMode !== "auto") {
      console.log(pc.italic("Starting the Interview process...\n"));
    }
    agentJson = await cliInterview(agentJson, {
      prompt,
      mode: interviewMode,
      inputStream,
      outputStream,
      events,
      jwt
    });
  }
  agentJson = ensureAgentJsonDefaults(agentJson);
  if (dstDir === "") {
    const sanitizedName = agentJson.name.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "_").replace(/_+/g, "_").toLowerCase();
    dstDir = path.join(cwd, sanitizedName);
  }
  console.log(pc.italic("Agent generated..."));
  console.log(pc.green("Name:"), agentJson.name);
  console.log(pc.green("Bio:"), agentJson.bio);
  console.log(pc.green("Description:"), agentJson.description);
  console.log(pc.green("Visual Description:"), agentJson.visualDescription);
  console.log(pc.green("Preview URL:"), agentJson.previewUrl);
  console.log(pc.green("Homespace Description:"), agentJson.homespaceDescription);
  console.log(pc.green("Homespace URL:"), agentJson.homespaceUrl);
  const featuresKeys = Object.keys(agentJson.features ?? {});
  console.log(
    pc.green("Features:"),
    featuresKeys.length > 0 ? featuresKeys.join(", ") : "*none*"
  );
  events && events.dispatchEvent(new MessageEvent("finalize", {
    data: {
      agentJson
    }
  }));
  const resolvedDstDir = path.resolve(dstDir);
  console.log("\nCreated agent at", ansi.link(resolvedDstDir, resolvedDstDir));
  console.log();
  console.log(pc.green("To start a chat with your agent, run:"));
  console.log(pc.cyan(`  usdk chat ${dstDir}`));
  console.log(pc.green(`To edit this agent again, run:`));
  console.log(pc.cyan(`  usdk edit ${dstDir}`));
  console.log();
  console.log(pc.green(`To set up your agent with a git repository, run:`));
  console.log(pc.cyan(`  git remote add origin https://github.com/USERNAME/REPOSITORY.git`));
  console.log();
  console.log(pc.green("To learn how to customize your agent with code, see the docs: https://docs.upstreet.ai/customize-your-agent"));
  console.log();
  console.log(pc.green(`Happy building!`));
  return agentJson;
};
var updateFeatures = (agentJson, {
  addFeature,
  removeFeature
}) => {
  agentJson = {
    ...agentJson
  };
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
      ...addFeature
    };
  }
  return agentJson;
};
var edit = async (args, opts) => {
  const dstDir = args._[0] ?? cwd;
  const prompt = args.prompt ?? "";
  const inputFile = args.input ?? null;
  const pfpFile = args.profilePicture ?? null;
  const hsFile = args.homeSpace ?? null;
  const inputStream = args.inputStream ?? null;
  const outputStream = args.outputStream ?? null;
  const events = args.events ?? null;
  const addFeature = args.addFeature;
  const removeFeature = args.removeFeature;
  const jwt = opts.jwt;
  if (!jwt) {
    throw new Error("You must be logged in to edit an agent.");
  }
  let agentJson = loadAgentJson(dstDir);
  if (inputFile) {
    const update = await getAgentJsonFromCharacterCard(inputFile);
    agentJson = {
      ...agentJson,
      ...update
    };
  }
  ;
  const previewImageFile = pfpFile || inputFile;
  if (previewImageFile) {
    agentJson = await addAgentJsonImage(agentJson, previewImageFile, "previewUrl");
  }
  if (hsFile) {
    agentJson = await addAgentJsonImage(agentJson, hsFile, "homespaceUrl");
  }
  agentJson = updateFeatures(agentJson, {
    addFeature,
    removeFeature
  });
  if (!(addFeature || removeFeature)) {
    agentJson = await cliInterview(agentJson, {
      prompt,
      mode: prompt ? "auto" : "edit",
      inputStream,
      outputStream,
      events,
      jwt
    });
  }
  const _updateFiles = async () => {
    await Promise.all([
      // agent.json
      (async () => {
        const agentJsonPath = path.join(dstDir, "agent.json");
        await fs.promises.writeFile(agentJsonPath, JSON.stringify(agentJson, null, 2));
      })()
    ]);
  };
  await _updateFiles();
};
var createProgram = () => {
  try {
    let commandExecuted = false;
    program.name("agent-interview").description("Create AI agent configurations using LLMs").exitOverride((err) => {
      if (!commandExecuted) {
        process.exit(0);
      }
    });
    const featureExamples = featureSpecs.reduce((acc, feature) => {
      acc[feature.name] = feature.examples;
      return acc;
    }, {});
    const featureExamplesString = Object.entries(featureExamples).map(([name, examples]) => {
      const exampleString = examples.map((example) => JSON.stringify(example)).join(", ");
      return `"${name}", example using json ${exampleString}`;
    }).join(". ");
    const parseFeatures = (featuresSpec) => {
      let features = {};
      for (const featuresString of featuresSpec) {
        const parsedJson = jsonParse(featuresString);
        if (parsedJson !== void 0) {
          features = {
            ...features,
            ...parsedJson
          };
        } else {
          features[featuresString] = featureExamples[featuresString][0];
        }
      }
      return features;
    };
    program.command("create").description("Create a new agent, from either a prompt or template").argument(`[directory]`, `Directory to create the project in`).option(`-p, --prompt <string>`, `Creation prompt`).option(`-i, --input <file>`, `Initialize from file (character card)`).option(`-pfp, --profile-picture <file>`, `Set the profile picture`).option(`-hs, --home-space <file>`, `Set the home space`).option(`-j, --json <string>`, `Agent JSON string to initialize with (e.g '{"name": "Ally", "description": "She is cool"}')`).option(`-y, --yes`, `Non-interactive mode`).option(`-f, --force`, `Overwrite existing files`).option(`-n, --no-install`, `Do not install dependencies`).option(`-F, --force-no-confirm`, `Overwrite existing files without confirming
Useful for headless environments. ${pc.red("WARNING: Data loss can occur. Use at your own risk.")}`).option(`-s, --source <string>`, `Main source file for the agent. ${pc.red("REQUIRED: Agent Json string must be provided using -j option")}`).option(
      `-feat, --feature <feature...>`,
      `Provide either a feature name or a JSON string with feature details. Default values are used if specifications are not provided. Supported features: ${pc.green(featureExamplesString)}`
    ).action(async (directory = void 0, opts = {}) => {
      logUpstreetBanner();
      console.log(`

  Welcome to USDK's Agent Creation process.

  ${pc.cyan(`v${packageJson.version}`)}

  To exit, press CTRL+C twice.
  If you're customizing the code for this Agent, you may need to reload this chat every time you save.

  ${pc.italic("For more information on the Agent creation process, head over to https://docs.upstreet.ai/create-an-agent#step-2-complete-the-agent-interview")}
  
`);
      await handleError(async () => {
        commandExecuted = true;
        let args;
        if (typeof directory === "string") {
          args = {
            _: [directory],
            ...opts
          };
        } else {
          args = {
            _: [],
            ...opts
          };
        }
        if (opts.feature) {
          args.feature = parseFeatures(opts.feature);
        }
        const jwt = await getLoginJwt();
        await create(args, {
          jwt
        });
      });
    });
    program.command("edit").description("Edit an existing agent").argument(`[directory]`, `Directory containing the agent to edit`).option(`-p, --prompt <string>`, `Edit prompt`).option(`-i, --input <file>`, `Update from file (character card)`).option(`-pfp, --profile-picture <file>`, `Set the profile picture`).option(`-hs, --home-space <file>`, `Set the home space`).option(
      `-af, --add-feature <feature...>`,
      `Add a feature`
    ).option(
      `-rf, --remove-feature <feature...>`,
      `Remove a feature`
    ).action(async (directory = void 0, opts = {}) => {
      await handleError(async () => {
        commandExecuted = true;
        let args;
        if (typeof directory === "string") {
          args = {
            _: [directory],
            ...opts
          };
        } else {
          args = {
            _: [],
            ...opts
          };
        }
        if (opts.addFeature) {
          args.addFeature = parseFeatures(opts.addFeature);
        }
        const jwt = await getLoginJwt();
        await edit(args, {
          jwt
        });
      });
    });
  } catch (error) {
    console.error("Error creating program:", error);
  }
  return program;
};
var main = async () => {
  createProgram();
  try {
    await program.parseAsync();
  } catch (error) {
    console.error("Error running program:", error);
  }
};

// src/main.ts
["uncaughtException", "unhandledRejection"].forEach(
  (event) => process.on(event, (err, err2) => {
    console.log("cli uncaught exception", err, err2);
    process.exit(1);
  })
);
(async () => {
  try {
    await main();
  } catch (err) {
    console.warn(err.stack);
    process.exit(1);
  }
})();
