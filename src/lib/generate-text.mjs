import { zodResponseFormat } from 'openai/helpers/zod';
import { defaultModels } from '../constants.mjs';

export const getTextGenerationConfig = () => {
  return {
    model: defaultModels[0],
    key: process.env.OPENAI_API_KEY,
  };
};

export const fetchJsonCompletion = async (opts, format) => {
  const {
    model = defaultModels[0],
    key = null,
    messages,
    stream,
  } = opts ?? {};

  const response_format = format && zodResponseFormat(format, 'result');

  let modelType = 'openai';
  let modelName = model;
  const match = model.match(/^([^:]+):([^:]+)/);
  if (match) {
    modelType = match[1];
    modelName = match[2];
  } else {
    throw new Error('invalid model: ' + model);
  }

  const u = `https://api.openai.com/v1/chat/completions`;
  const res = await fetch(u, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: modelName,
      messages,
      response_format,
      stream,
    }),
  });
  if (res.ok) {
    const j = await res.json();
    let content = j.choices[0].message.content;
    if (format) {
      content = JSON.parse(content);
    }
    return content;
  } else {
    const text = await res.text();
    throw new Error('error response in fetch completion: ' + res.status + ': ' + text);
  }
};

