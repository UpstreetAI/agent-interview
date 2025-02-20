// import { aiProxyHost } from './endpoints.mjs';
import * as fal from "@fal-ai/serverless-client";
import {
  dataUrlToBlob,
} from 'base64-universal';

export const getImageGenerationConfig = () => {
  let model;
  let key;
  if (process.env.FAL_KEY) {
    model = 'black-forest-labs:flux';
    key = process.env.FAL_KEY;
  } else if (process.env.OPENAI_API_KEY) {
    model = 'openai:dall-e-3';
    key = process.env.OPENAI_API_KEY;
  } else {
    throw new Error('no key');
  }
  return {
    model,
    key,
  };
};

export const imageSizes = [
  "square_hd",
  "square",
  "portrait_4_3",
  "portrait_16_9",
  "landscape_4_3",
  "landscape_16_9",
];
const generateFlux = async ({
  prompt,
  image_size,
  num_inference_steps,
  seed,
  guidance_scale,
  num_images,
  sync_mode = true,
  enable_safety_checker = false,
  key,
}) => {
  fal.config({
    credentials: key,
  });
  const result = await fal.subscribe('fal-ai/flux/dev', {
    input: {
      prompt,
      image_size,
      num_inference_steps,
      seed,
      guidance_scale,
      num_images,
      sync_mode,
      enable_safety_checker,
    },
    // logs: true,
    // onQueueUpdate: (update) => {
    //   if (update.status === 'IN_PROGRESS') {
    //     update.logs.map((log) => log.message).forEach(console.log);
    //   }
    // },
  });
  const { images, timings, seed: outputSeed, has_nsfw_concepts } = result;
  const image = images[0];
  const { url, content_type } = image;
  const blob = await dataUrlToBlob(url, content_type);
  blob.seed = outputSeed + '';
  return blob;
};
export const fetchImageGeneration = async (opts) => {
  const {
    model = 'black-forest-labs:flux',
    key = null,
    prompt,
    image_size = 'landscape_4_3', // "square_hd", "square", "portrait_4_3", "portrait_16_9", "landscape_4_3", "landscape_16_9"
  } = opts ?? {};
  if (model === 'black-forest-labs:flux') {
    const blob = await generateFlux({
      prompt,
      image_size,
      key,
    });
    return blob;
  } else if (model === 'openai:dall-e-3') {
    const {
      width = 1024, // [1024, 1792]
      height = 1024,
      quality = 'hd', // ['hd', 'standard']
    } = opts ?? {};
    const u = `https://api.openai.com/v1/images/generations`;
    const j = {
      prompt,
      model: 'dall-e-3',
      size: `${width}x${height}`,
      quality,
      n: 1,
    };
    const res = await fetch(u, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(j),
    });
    if (res.ok) {
      const blob = await res.blob();
      return blob;
    } else {
      const text = await res.text();
      // const { error } = json;
      console.log('got generate image error', text);
      throw new Error(`image generation error: ${text}`);
    }
  } else {
    throw new Error('unknown image generation model: ' + model);
  }
};

const characterImageSizeFlux = 'portrait_4_3';
export const generateCharacterImage = async (prompt, opts) => {
  const {
    stylePrompt = `full body shot, front view, facing viewer, standing straight, arms at side, neutral expression, high resolution, flcl anime style`,
    seed,
    guidance_scale,
  } = opts ?? {};

  const fullPrompt = [
    stylePrompt,
    prompt,
  ].filter(Boolean).join('\n');
  const blob = await fetchImageGeneration({
    prompt: fullPrompt,
    image_size: characterImageSizeFlux,
    seed,
    guidance_scale,
    ...getImageGenerationConfig(),
  });

  return {
    fullPrompt,
    blob,
  };
};

const backgroundImageSizeFlux = 'square_hd';
export const generateBackgroundImage = async (prompt, opts) => {
  const {
    stylePrompt = `flcl anime style background art`,
    seed,
    guidance_scale,
  } = opts ?? {};

  const fullPrompt = [
    stylePrompt,
    prompt,
  ].filter(Boolean).join('\n');
  const blob = await fetchImageGeneration({
    prompt: fullPrompt,
    image_size: backgroundImageSizeFlux,
    seed,
    guidance_scale,
    ...getImageGenerationConfig(),
  });

  return {
    fullPrompt,
    blob,
  };
};