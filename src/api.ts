import { Readable, Writable } from 'stream';
import {
  runInterview,
} from './cli.ts';

//

class AbstractAgent {
  constructor(
    prompt: string,
  ) {}
}

//

type PluginConfig = {
  name: string;
  description?: string;
  author?: string;
  parameters: Record<string, any>;
};

//

class AbstractRegistry {
  constructor() {}
  async getPlugins(): Promise<string[]> {
    throw new Error('Not implemented');
  }
  async getPlugin(fullName: string): Promise<PluginConfig> {
    throw new Error('Not implemented');
  }
}

const eosRegistryBaseUrl = `https://eliza-plugins-hub.vercel.app/api`;
export class ElizaosRegistry extends AbstractRegistry {
  constructor() {
    super();
  }
  async getPlugins(): Promise<string[]> {
    const params = new URLSearchParams({
      // page: page.toString(),
      // per_page: per_page.toString(),
      // search,
      // orderBy,
      // officialOnly: officialOnly.toString()
      officialOnly: 'true',
    });
  
    const res = await fetch(`${eosRegistryBaseUrl}/plugins?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      const { plugins } = data;
      return plugins;
      // const names = plugins.map((plugin: any) => plugin.full_name);
      // return names;
    } else {
      throw new Error(`Failed to fetch plugins: ${res.statusText}`);
    }
  }
  async getPlugin(fullName: string): Promise<PluginConfig> {
    const match = fullName.match(/^([^/]+)\/([^/]+)$/);
    if (match) {
      const owner = match[1];
      const repo = match[2];
      const res = await fetch(`${eosRegistryBaseUrl}/plugins/${owner}/${repo}`);
      if (res.ok) {
        const data = await res.json();
        return data;
        // const { plugin } = data;
        // return plugin;
      } else {
        throw new Error(`Failed to fetch plugin: ${res.statusText}`);
      }
    } else {
      throw new Error(`Invalid plugin name: ${fullName}`);
    }
  }
}

export class ReactAgentsRegistry extends AbstractRegistry {
  constructor() {
    super();
  }
  async getPlugins(): Promise<string[]> {
    return [];
  }
  async getPlugin(fullName: string): Promise<PluginConfig> {
    return null;
  }
}

//

const loadPlugins = async (registry: AbstractRegistry) => {
  const plugins = await registry.getPlugins();
  const pluginDatas = await Promise.all(plugins.map(async (plugin: any) => {
    const pluginData = await registry.getPlugin(plugin.full_name);
    return pluginData;
  }));
  const pluginDatas2 = pluginDatas.map((pluginData: any) => {
    const {
      plugin,
      stats,
      packageJson,
      agentConfig,
      readmeContent,
    } = pluginData;
    return {
      plugin,
      stats,
      packageJson,
      agentConfig,
      readmeContent,
    };
  });
  return pluginDatas2;
}

//

export const createAgent = async ({
  prompt,
  inputStream,
  outputStream,
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
  const plugins = await loadPlugins(registry);

  let agentJson = json;
  agentJson = await runInterview(agentJson, {
    prompt,
    mode: 'auto',
    inputStream,
    outputStream,
    events,
    plugins,
  });
  return agentJson;
};

// export const editAgent = async ({

// }: {
    
// }) => {

// };