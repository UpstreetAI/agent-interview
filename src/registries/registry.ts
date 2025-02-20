export class AbstractAgent {
  constructor(
    prompt: string,
  ) {}
}

export type PluginConfig = {
  name: string;
  description?: string;
  author?: string;
  parameters: Record<string, any>;
};
export type PluginConfigExt = {
  plugin: PluginConfig;
};

export abstract class AbstractRegistry {
  abstract getPlugins(search?: string): Promise<PluginConfig[]>;
  abstract getPlugin(fullName: string): Promise<PluginConfigExt>;
  async getAllPlugins(): Promise<PluginConfigExt[]> {
    const plugins = await this.getPlugins();
    const pluginDatas = await Promise.all(plugins.map(async (plugin: any) => {
      const pluginData = await this.getPlugin(plugin.full_name);
      return pluginData;
    }));
    console.log('got pluginDatas', pluginDatas);
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
}