import {
  type PluginConfig,
  type PluginConfigExt,
} from './plugin.ts';

export abstract class AbstractRegistry {
  abstract getPlugins(search?: string): Promise<PluginConfig[]>;
  abstract getPlugin(fullName: string): Promise<PluginConfigExt>;
  async getAllPlugins(): Promise<PluginConfigExt[]> {
    const plugins = await this.getPlugins();
    const pluginDatas = await Promise.all(plugins.map(async (plugin: any) => {
      const pluginData = await this.getPlugin(plugin.full_name);
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
};