export type AgentConfig = any;

export type PluginConfig = {
  id: number;
  owner: {
    avatar_url: string;
    name: string;
  };
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  updated_at: string;
  topics: string[];
  license: string;
  is_official: boolean;
  banner: string;
  logo: string;
};
type PluginStats = {
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  watchers_count: number;
};
type PluginPackageJson = any;
type PluginAgentConfig = {
  pluginType: string;
  pluginParameters: Record<string, any>;
};

export type PluginConfigExt = {
  plugin: PluginConfig;
  stats: PluginStats;
  packageJson: PluginPackageJson;
  agentConfig: PluginAgentConfig;
  readmeContent: string;
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