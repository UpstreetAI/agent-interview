import { z } from 'zod';
import dedent from 'dedent';

import {
  type PluginConfig,
  type PluginConfigExt,
} from '../../types/plugin.ts';
import {
  AbstractRegistry,
} from '../../types/registry.ts';

const currencies = ['usd'];
const intervals = ['month', 'year', 'week', 'day'];

export const paymentPropsType = z.object( {
  name: z.string(),
  description: z.string().optional(),
  amount: z.number().int(),
  currency: z.enum( currencies as any ),
} );
export const paymentItemType = z.object( {
  type: z.literal( 'payment' ),
  props: paymentPropsType,
} );
export const subscriptionPropsType = z.object( {
  name: z.string(),
  description: z.string().optional(),
  amount: z.number().int(),
  currency: z.enum( currencies as any ),
  interval: z.enum( intervals as any ),
  intervalCount: z.number(),
} );
export const subscriptionItemType = z.object( {
  type: z.literal( 'subscription' ),
  props: subscriptionPropsType,
} );
export const storeItemType = z.union( [
  paymentItemType,
  subscriptionItemType,
] );

//

export const defaultVoices = [
  {
    voiceEndpoint: 'elevenlabs:kadio:YkP683vAWY3rTjcuq2hX',
    name: 'Kaido',
    description: 'Teenage anime boy',
  },
  {
    voiceEndpoint: 'elevenlabs:drake:1thOSihlbbWeiCGuN5Nw',
    name: 'Drake',
    description: 'Anime male',
  },
  {
    voiceEndpoint: 'elevenlabs:terrorblade:lblRnHLq4YZ8wRRUe8ld',
    name: 'Terrorblade',
    description: 'Monstrous male',
  },
  {
    voiceEndpoint: 'elevenlabs:scillia:kNBPK9DILaezWWUSHpF9',
    name: 'Scillia',
    description: 'Teenage anime girl',
  },
  {
    voiceEndpoint: 'elevenlabs:mommy:jSd2IJ6Fdd2bD4TaIeUj',
    name: 'Mommy',
    description: 'Anime female',
  },
  {
    voiceEndpoint: 'elevenlabs:uni:PSAakCTPE63lB4tP9iNQ',
    name: 'Uni',
    description: 'Waifu girl',
  },
];

export const featureSpecs = [
  {
    name: 'tts',
    version: '0.0.1',
    description: dedent`\
      Text to speech.
      Available voice endpoints:
    ` + '\n'
      + defaultVoices.map( v => `* ${JSON.stringify( v.name )}: ${v.voiceEndpoint}` ).join( '\n' ),
    schema: {
      voiceEndpoint: {
        type: 'string',
        enum: defaultVoices.map(v => v.voiceEndpoint),
        // default: defaultVoices[0].voiceEndpoint,
        examples: [defaultVoices[0].voiceEndpoint]
      }
    },
    examples: [{ voiceEndpoint: defaultVoices[0].voiceEndpoint },],

    // For Web UI
    displayIcon: 'Voice',
    displayName: 'Voice',
    displayDescription: 'Select a voice for your agent.',
    form: {
      voiceEndpoint: {
        type: 'select',
        label: 'Voice',
        description: 'Select a voice for your agent.',
        options: defaultVoices.map( v => ({ value: v.voiceEndpoint, label: v.name }) ),
        defaultValue: defaultVoices[0].voiceEndpoint,
      },
    },

    // Feature in development ( true, false )
    dev: false,
  },
  {
    name: 'rateLimit',
    version: '0.0.1',
    description: dedent`\
      Agent is publicly available.
      The rate limit is \`maxUserMessages\` messages per \`maxUserMessagesTime\` milliseconds.
      When the rate limit is exceeded, the agent will respond with the static \`message\`.
      If either \`maxUserMessages\` or \`maxUserMessagesTime\` is not provided or zero, the rate limit is disabled.
    ` + '\n'
      + defaultVoices.map( v => `* ${JSON.stringify( v.name )}: ${v.voiceEndpoint}` ).join( '\n' ),
    schema: {
      maxUserMessages: { 
        type: 'number',
        // default: 5,
        examples: [5]
      },
      maxUserMessagesTime: { 
        type: 'number',
        // default: 60000,
        examples: [60000]
      },
      message: { 
        type: 'string',
        // default: "Whoa there! Take a moment.",
        examples: ["Whoa there! Take a moment."]
      }
    },
    examples: [{ maxUserMessages: 5, maxUserMessagesTime: 60000, message: "Whoa there! Take a moment.", }],

    // For Web UI
    displayIcon: 'Chat',
    displayName: 'Rate Limit',
    displayDescription: 'Control how often users can message the agent.',
    form: {
      maxUserMessages: {
        type: 'number',
        label: 'Max User Messages',
        description: 'The maximum number of messages a user can send to the agent.',
        defaultValue: 5,
      },
      maxUserMessagesTime: {
        type: 'number',
        label: 'Max User Messages Time',
        description: 'The time in milliseconds after which a user can send another message to the agent.',
        defaultValue: 60 * 60 * 24 * 1000, // 1 day
      },
      message: {
        type: 'text',
        label: 'Message',
        description: 'The message to send to the agent when the rate limit is exceeded.',
        defaultValue: 'Whoa there! Take a moment.',
      },
    },
    // Feature in development ( true, false )
    dev: false,
  },
  {
    name: 'discord',
    version: '0.0.1',
    description: dedent`\
      Add Discord integration to the agent. Add this feature only when the user explicitly requests it and provides a bot token.

      The user should follow these instructions to set up their bot (you can instruct them to do this):
      - Create a bot application at https://discord.com/developers/applications and note the CLIENT_ID (also called "application id")
      - Enable Privileged Gateway Intents at https://discord.com/developers/applications/CLIENT_ID/bot
      - Add the bot to your server at https://discord.com/oauth2/authorize/?permissions=-2080908480&scope=bot&client_id=CLIENT_ID
      - Get the bot token at https://discord.com/developers/applications/CLIENT_ID/bot
      The token is required and must be provided.

      \`channels\` is a list of channel names (text or voice) that the agent should join.
    `,
    schema: {
      token: { 
        type: 'string',
        // default: '',
        examples: ['YOUR_DISCORD_BOT_TOKEN']
      },
      channels: {
        type: 'array',
        items: { type: 'string' },
        // default: ['general', 'voice'],
        examples: [['general', 'voice']]
      }
    },
    examples: [{ token: 'YOUR_DISCORD_BOT_TOKEN', channels: ['general', 'voice'], }],

    // For Web UI
    displayIcon: 'Discord',
    displayName: 'Discord',
    displayDescription: 'Connect your agent to Discord.',
    form: {
      token: {
        type: 'text',
        label: 'Token',
        description: 'The token for your Discord bot.',
        defaultValue: '',
      },
      channels: {
        type: 'text',
        label: 'Channels',
        description: 'The channels to join.',
        options: [
          { value: 'general', label: 'General' },
          { value: 'voice', label: 'Voice' },
        ],
        defaultValue: [],
      },
    },
    // Feature in development ( true, false )
    dev: false,
  },
  {
    name: 'twitterBot',
    version: '0.0.1',
    description: dedent`\
      Add a Twitter bot to the agent.

      The API token is required.
    `,
    schema: {
      token: { 
        type: 'string',
        // default: '',
        examples: ['YOUR_TWITTER_BOT_TOKEN']
      }
    },
    examples: [{ token: 'YOUR_TWITTER_BOT_TOKEN', }],

    // For Web UI
    displayIcon: 'X',
    displayName: 'X (Twitter)',
    displayDescription: 'Add a Twitter bot to your agent.',
    form: {
      token: {
        type: 'text',
        label: 'Token',
        description: 'The token for your Twitter bot.',
        defaultValue: '',
      },
    },

    // Feature in development ( true, false )
    dev: false,
  },
  {
    name: 'telnyx',
    version: '0.0.1',
    description: dedent`\
      Add Telnyx phone call/SMS support to the agent. Add this feature only when the user explicitly requests it and provides an api key.

      Phone number is optional, but if provided must be in +E.164 format (e.g. +14151234567).
    `,
    schema: {
      apiKey: { 
        type: 'string',
        // default: '',
        examples: ['YOUR_TELNYX_API_KEY']
      },
      phoneNumber: { 
        type: 'string',
        // default: '',
        examples: ['+14151234567']
      },
      message: { 
        type: 'boolean',
        // default: false,
        examples: [true]
      },
      voice: { 
        type: 'boolean',
        // default: false,
        examples: [true]
      }
    },
    examples: [{ apiKey: 'YOUR_TELNYX_API_KEY', phoneNumber: '+14151234567', message: true, voice: true, }],

    // For Web UI
    displayIcon: 'Upstreet',
    displayName: 'Telnyx',
    displayDescription: 'Enable phone call and SMS support for your agent.',
    // Form
    form: {
      apiKey: {
        type: 'text',
        label: 'API Key',
        description: 'The API key for your Telnyx account.',
        defaultValue: '',
      },
      phoneNumber: {
        type: 'text',
        label: 'Phone Number',
        description: 'The phone number to use for Telnyx.',
        defaultValue: '',
      },
      message: {
        type: 'checkbox',
        label: 'Message',
        description: 'Enable message support.',
        defaultValue: false,
      },
      voice: {
        type: 'checkbox',
        label: 'Voice',
        description: 'Enable voice support.',
        defaultValue: false,
      },
    },

    // Feature in development ( true, false )
    dev: true,
  },
  {
    name: 'storeItems',
    version: '0.0.1',
    description: dedent`\
      List of items that can be purchased from the agent, with associated prices.
      \`amount\` in cents (e.g. 100 = $1).
    `,
    schema: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['payment', 'subscription'],
              examples: ['payment']
            },
            name: { 
              type: 'string',
              examples: ['Art']
            },
            description: { 
              type: 'string',
              examples: ['An art piece']
            },
            amount: { 
              type: 'integer',
              examples: [499]
            },
            currency: { 
              type: 'string', 
              enum: currencies,
              examples: ['usd']
            },
            interval: { 
              type: 'string', 
              enum: intervals,
              examples: [intervals[0]]
            },
            intervalCount: { 
              type: 'integer',
              examples: [1]
            }
          },
          required: ['type', 'props', 'amount', 'currency', 'interval', 'intervalCount']
        }
      }
    },
    examples: [{ items: [{ type: 'payment', props: { name: 'Art', description: 'An art piece', amount: 499, currency: 'usd', }, },], }],

    // Default values
    default: [
      {
        items: [{
          type: 'payment',
          props: {
            name: '',
            description: '',
            amount: 100,
            currency: currencies[0],
            interval: intervals[0],
            intervalCount: 1,
          },
        }],
      }
    ],

    // For Web UI
    displayIcon: 'ModuleStore',
    displayName: 'Store',
    displayDescription: 'Manage items your agent can sell.',
    form: {
      items: {
        type: 'array',
        label: 'Items',
        description: 'The items to sell.',
        defaultValue: [],
      },
    },

    // Feature in development ( true, false )
    dev: true,
  },
];

//

export class ReactAgentsRegistry extends AbstractRegistry {
  async getPlugins(search?: string): Promise<PluginConfig[]> {
    throw new Error('Not implemented');
  }
  async getPlugin(fullName: string): Promise<PluginConfigExt> {
    throw new Error('Not implemented');
  }
  getAllPlugins(): Promise<PluginConfigExt[]> {
    // convert the featureSpecs to PluginConfigExt
    const updatedDate = new Date().toISOString();
    return Promise.resolve(featureSpecs.map(featureSpec => {
      const makeOwner = () => ({
        avatar_url: '',
        name: 'react-agents',
      });
      const makeStats = () => ({
        stargazers_count: 0,
        forks_count: 0,
        open_issues_count: 0,
        watchers_count: 0
      });
      
      return {
        plugin: {
          owner: makeOwner(),
          name: featureSpec.name,
          full_name: `react-agents/${featureSpec.name}`,
          description: featureSpec.description,
          html_url: '',
          updated_at: updatedDate,
          topics: [],
          license: '',
          is_official: true,
          banner: '',
          logo: '',
        },
        stats: makeStats(),
        packageJson: {
          name: featureSpec.name,
          version: featureSpec.version,
          description: featureSpec.description,
        },
        agentConfig: {
          pluginType: 'react-agents:feature:1.0.0',
          pluginParameters: featureSpec.schema,
        },
        readmeContent: featureSpec.description,
      };
    }));
  }
}