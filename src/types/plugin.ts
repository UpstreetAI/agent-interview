export type PluginConfig = {
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
export type PluginConfigExt = {
  plugin: PluginConfig;
  stats: PluginStats;
  packageJson: PluginPackageJson;
  agentConfig: PluginAgentConfig;
  readmeContent: string;
};

type PluginStats = {
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  watchers_count: number;
};
type PluginPackageJson = {
  name: string;
  version?: string;
  description?: string;
};
type PluginAgentConfig = {
  pluginType: string;
  pluginParameters: Record<string, any>;
};