import dedent from 'dedent';
import { z } from 'zod';
import {
  blobToDataUrl,
} from 'base64-universal';
import {
  jsonSchemaToZod,
} from 'json-schema-to-zod-safe';

import {
  type AbstractAgent,
} from '../types/agent.ts';
import {
  type PluginConfigExt,
} from '../types/plugin.ts';

import {
  Interactor,
} from './interactor.js';
import {
  ValueUpdater,
} from './value-updater.js';
import {
  generateCharacterImage,
  generateBackgroundImage,
} from './generate-image.mjs';

const makePromise = <T>() => {
  const {
    promise,
    resolve,
    reject,
  } = Promise.withResolvers<T>();
  (promise as any).resolve = resolve;
  (promise as any).reject = reject;
  return promise;
};
const pluginParametersToZod = (pluginParameters: Record<string, any>) => {
  const result = {};
  for (const [key, value] of Object.entries(pluginParameters)) {
    result[key] = jsonSchemaToZod(value);
  }
  return z.object(result);
};

const featureSpecsToZod = (featureSpecs: PluginConfigExt[]) => {
  const featureTypes: z.ZodTypeAny[] = [];
  for (const featureSpec of featureSpecs) {
    const name = featureSpec.plugin.full_name;
    const pluginParameters = featureSpec.agentConfig?.pluginParameters;
    const schema = pluginParameters ?
      pluginParametersToZod(featureSpec.agentConfig.pluginParameters)
    :
      z.object({});
    const featureType = z.object({
      name: z.literal(name),
      schema,
    });
    featureTypes.push(featureType);
  }
  if (featureTypes.length === 0) {
    return z.array(z.never());
  } else if (featureTypes.length === 1) {
    return z.array(featureTypes[0]);
  } else {
    return z.array(z.union(featureTypes as any));
  }
};

// Generate feature prompt
const generateFeaturePrompt = (featureSpecs: PluginConfigExt[]) => {
  return dedent`\
    The available features are:
  ` + '\n' +
  JSON.stringify(featureSpecs.map(feature => {
    const name = feature.plugin.full_name;
    const description = feature.plugin.description;
    return {
      name,
      description,
    }
  }), null, 2) + '\n\n';
};

export class AgentInterview extends EventTarget {
  interactor: Interactor;
  loadPromise: Promise<AbstractAgent>;

  constructor(opts: {
    agentJson: AbstractAgent;
    prompt: string;
    mode: 'auto' | 'interactive' | 'manual';
    featureSpecs: PluginConfigExt[];
  }) {
    super();

    let {
      agentJson,
      prompt,
      mode,
      featureSpecs,
    } = opts;

    // generate the features available prompt
    const featuresAvailablePrompt = generateFeaturePrompt(featureSpecs);

    // character image generator
    const visualDescriptionValueUpdater = new ValueUpdater(async (visualDescription, {
      signal,
    }) => {
      const {
        blob,
      } = await generateCharacterImage(visualDescription, undefined);
      return blob;
    });
    visualDescriptionValueUpdater.addEventListener('change', async (e) => {
      this.dispatchEvent(new MessageEvent('preview', {
        data: e.data,
      }));
    });

    // homespace image generator
    const homespaceDescriptionValueUpdater = new ValueUpdater(async (homespaceDescription, {
      signal,
    }) => {
      const {
        blob,
      } = await generateBackgroundImage(homespaceDescription, undefined);
      return blob;
    });
    homespaceDescriptionValueUpdater.addEventListener('change', async (e) => {
      this.dispatchEvent(new MessageEvent('homespace', {
        data: e.data,
      }));
    });

    const pumpIo = (response = '') => {
      this.dispatchEvent(new MessageEvent('input', {
        data: {
          question: response,
        },
      }));
    };
    const sendOutput = (text) => {
      this.dispatchEvent(new MessageEvent('output', {
        data: {
          text,
        },
      }));
    };
    this.loadPromise = makePromise<AbstractAgent>();

    // initialize
    if (agentJson.previewUrl) {
      visualDescriptionValueUpdater.setResult(agentJson.previewUrl);
    }
    if (agentJson.homespaceUrl) {
      homespaceDescriptionValueUpdater.setResult(agentJson.homespaceUrl);
    }

    // interaction loop
    const featureSchemas = featureSpecsToZod(featureSpecs);
    this.interactor = new Interactor({
      systemPrompt:
        dedent`\
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
          ${mode == 'auto' ?
            `When you think the session is over, set the \`done\` flag.`
          :
            `When you think the session is over, then set the \`done\` flag. You might want to confirm with the user beforehand.`
          }
        ` + '\n\n' +
        featuresAvailablePrompt,
      userPrompt: prompt,
      object: agentJson,
      objectFormat: z.object({
        name: z.string().optional(),
        bio: z.string().optional(),
        description: z.string().optional(),
        visualDescription: z.string().optional(),
        homespaceDescription: z.string().optional(),
        features: featureSchemas,
        private: z.boolean().optional(),
      }),
      formatFn: (updateObject) => {
        updateObject = structuredClone(updateObject);
        // remove all optional features
        if (updateObject?.features) {
          for (const featureName in updateObject.features) {
            const value = updateObject.features[featureName];
            if (value === null || value === undefined) {
              delete updateObject.features[featureName];
            }
          }
        }
        return updateObject;
      },
    });
    this.interactor.addEventListener('processingStateChange', (event) => {
      this.dispatchEvent(new MessageEvent('processingStateChange', {
        data: event.data,
      }))
    });
    this.interactor.addEventListener('message', async (e) => {
      const o = e.data;

      const {
        response,
        updateObject,
        done,
        object,
      } = o;

      // external handling
      agentJson = object;
      if (updateObject) {
        const hasNonNullValues = obj =>
          Object.values(obj).some(value => value !== null && value !== undefined);

        const shouldDispatchProperty = (key, value) => {
          // skip visual/homespace descriptions as they're handled separately
          if (key === 'visualDescription' || key === 'homespaceDescription') {
            return false;
          }

          // For features object, only log if it has any non-null values
          if (key === 'features' && typeof value === 'object') {
            return hasNonNullValues(value);
          }

          // For other properties, log if they're not null/undefined
          return value !== null && value !== undefined;
        };

        Object.entries(updateObject)
          .filter(([key, value]) => shouldDispatchProperty(key, value))
          .forEach(([key, value]) => {
            this.dispatchEvent(new MessageEvent(key, {
              data: value
            }));
          });

        this.dispatchEvent(new MessageEvent('change', {
          data: {
            updateObject,
            agentJson,
          },
        }));
      }

      // internal handling
      if (updateObject?.visualDescription) {
        visualDescriptionValueUpdater.set(updateObject.visualDescription);
      }
      if (updateObject?.homespaceDescription) {
        homespaceDescriptionValueUpdater.set(updateObject.homespaceDescription);
      }

      // console.log('agent interview done', {
      //   done,
      //   response,
      // });
      if (!done) {
        // pump i/o
        pumpIo(response);
      } else {
        response && sendOutput(response);

        const getPreviewUrl = async (valueUpdater) => {
          const result = await valueUpdater.waitForLoad();

          if (typeof result === 'string') {
            return result;
          } else if (result instanceof Blob) {
            const dataUrl = await blobToDataUrl(result);
            return dataUrl;
            // const guid = crypto.randomUUID();
            // const p = ['avatars', guid, `image.jpg`].join('/');
            // throw new Error('not implemented');
            // return await uploadBlob(p, result, {
            //   jwt,
            // });
          } else if (result === null) {
            return '';
          } else {
            console.warn('invalid result type', result);
            throw new Error('invalid result type: ' + typeof result);
          }
        };

        // return result
        [
          agentJson.previewUrl,
          agentJson.homespaceUrl,
        ] = await Promise.all([
          getPreviewUrl(visualDescriptionValueUpdater),
          getPreviewUrl(homespaceDescriptionValueUpdater),
        ]);
        this.loadPromise.resolve(agentJson);
      }
    });
    setTimeout(() => {
      if (mode === 'auto') {
        // automatically run the interview to completion
        this.interactor.end();
      } else if (mode === 'interactive') {
        // initiate the interview with an introductory message
        pumpIo('What do you want your agent to do?');
      } else if (mode === 'edit') {
        // initiate the interview with an introductory message
        pumpIo('What edits do you want to make?');
      } else if (mode === 'manual') {
        // wait for external prompting
      } else {
        throw new Error(`invalid mode: ${mode}`)
      }
    }, 0);
  }
  write(response) {
    this.interactor.write(response);
  }
  async waitForFinish() {
    return await this.loadPromise;
  }
}