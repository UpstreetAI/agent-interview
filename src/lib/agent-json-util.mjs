import {
  defaultModels,
  defaultSmallModels,
  defaultLargeModels,
} from '../constants.mjs';

export const ensureAgentJsonDefaults = (spec) => {
  spec = {
    ...spec,
  };

  if (typeof spec.name !== 'string' || !spec.name) {
    const suffix = Math.floor(10000 + Math.random() * 90000);
    spec.name = `AI Agent ${suffix}`;
  }
  if (typeof spec.description !== 'string' || !spec.description) {
    spec.description = 'Created by the AI Agent SDK';
  }
  if (typeof spec.bio !== 'string' || !spec.bio) {
    spec.bio = 'A cool AI';
  }
  if (typeof spec.model !== 'string' || !spec.model) {
    spec.model = defaultModels[0];
  }
  if (typeof spec.smallModel !== 'string' || !spec.smallModel) {
    spec.smallModel = defaultSmallModels[0];
  }
  if (typeof spec.largeModel !== 'string' || !spec.largeModel) {
    spec.largeModel = defaultLargeModels[0];
  }
  if (typeof spec.previewUrl !== 'string' || !spec.previewUrl) {
    spec.previewUrl = '';
  }
  if (typeof spec.avatarUrl !== 'string' || !spec.avatarUrl) {
    spec.avatarUrl = '';
  }
  if (typeof spec.homespaceUrl !== 'string' || !spec.homespaceUrl) {
    spec.homespaceUrl = '';
  }
  if (typeof spec.voiceEndpoint !== 'string' || !spec.voiceEndpoint) {
    spec.voiceEndpoint = 'elevenlabs:scillia:kNBPK9DILaezWWUSHpF9';
  }

  return spec;
};