import path from 'path';
import fs from 'fs';
import readline from 'readline';
import { rimraf } from 'rimraf';
import pc from 'picocolors';

export const cleanDir = async (dstDir, { force, forceNoConfirm } = {}) => {
  const files = await (async () => {
    try {
      return await fs.promises.readdir(dstDir);
    } catch (err) {
      if (err.code === 'ENOENT') {
        return [];
      } else {
        throw err;
      }
    }
  })();
  if (files.length > 0) {
    if (force || forceNoConfirm) {
      if (!forceNoConfirm) {
        const rl = readline.promises.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        const answer = await rl.question(`\nDelete the contents of "${path.resolve(dstDir)}"? ${pc.cyan('y/N')}: `)
        rl.close();
        console.log();

        if (!isYes(answer)) {
          throw new Error('aborted');
        }
      }

      // Remove all files.
      console.log(pc.italic('Removing old files...'));
      await Promise.all(
        files.map((filePath) => rimraf(path.join(dstDir, filePath))),
      );
      console.log(pc.italic('Removed old files...'));
    } else {
      // throw error
      throw new Error('directory is not empty (-f to override)');
    }
  }
};