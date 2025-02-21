import {
  type AbstractAgent,
} from '../types/agent.ts';

export const createAbstractAgent = (): AbstractAgent => ({
  name: "",
  description: "",
  bio: "",
  model: "",
  smallModel: "",
  largeModel: "",
  avatarUrl: "",
  homespaceUrl: "",
  voiceEndpoint: "",
  features: [],
});
