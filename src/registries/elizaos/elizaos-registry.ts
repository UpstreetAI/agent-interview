import {
  AbstractRegistry,
} from '../../types/registry.ts';
import {
  type PluginConfig,
  type PluginConfigExt,
} from '../../types/plugin.ts';

const eosRegistryBaseUrl = `https://eliza-plugins-hub.vercel.app/api`;
export class ElizaosRegistry extends AbstractRegistry {
  async getPlugins(search?: string): Promise<PluginConfig[]> {
    const params = new URLSearchParams({
      // page: page.toString(),
      // per_page: per_page.toString(),
      // search,
      // orderBy,
      // officialOnly: officialOnly.toString()
      search,
      officialOnly: 'true',
    });
  
    // XXX this needs to be paginated
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
  async getPlugin(fullName: string): Promise<PluginConfigExt> {
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