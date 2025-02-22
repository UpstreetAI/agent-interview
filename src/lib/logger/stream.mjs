import util from 'util';

class StreamStrategy {
  constructor(inputStream, outputStream) {
    this.inputStream = inputStream;
    this.outputStream = outputStream;
  }

  async askQuestion(question) {
    for (;;) {
      const answer = await new Promise((resolve) => {
        this.outputStream.write(question);
        this.inputStream.resume();
        this.inputStream.once('data', (data) => {
          resolve(data);
          this.inputStream.pause();
        });
      });
      if (answer) {
        return answer;
      }
    }
  }

  log(...args) {
    const formattedArgs = args.map(arg => {
      if (typeof arg === 'string') {
        return arg;
      } else {
        return util.inspect(arg, {
          depth: 3,
          // colors: true,
        });
      }
    });
    this.outputStream.write(formattedArgs.join(' '));
  }

  close() {
    this.outputStream.end();
  }
}

export default StreamStrategy;