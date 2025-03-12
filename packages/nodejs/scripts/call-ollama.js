import { readFile } from 'fs/promises';
import ollama from 'ollama';

/**
 * Streams the response from Ollama to the console.
 *
 * @param {*} response - The response from Ollama.
 */
async function streamResponse(response) {
  const thinkEndToken = '</think>';
  const thinkLabel = 'OLLAMA Thought';
  const thinkingDots = ['.', '..', '...'];
  const dotInterval = 400;
  let thinkingDotsIndex = 0;
  let thinking = true;
  let accumulatedContent = '';
  const thinkingInterval = setInterval(() => {
    process.stdout.clearLine();
    process.stdout.write(`OLLAMA Thinking${thinkingDots[thinkingDotsIndex]}\r`);
    thinkingDotsIndex += 1;
    thinkingDotsIndex %= thinkingDots.length;
  }, dotInterval);
  console.time(thinkLabel);
  for await (const part of response) {
    accumulatedContent += part.message.content;
    if (thinking) {
      if (accumulatedContent.includes(thinkEndToken)) {
        process.stdout.clearLine();
        console.timeEnd(thinkLabel);
        const tail = accumulatedContent.split(thinkEndToken)[1];
        process.stdout.write(`OLLAMA Response: ${tail}`);
        clearInterval(thinkingInterval);
        thinking = false;
      }
    } else {
      process.stdout.write(part.message.content); // Write each part of the response to the console
    }
  }
}

const getFileContent = async (path) => {
  const resolvedPath = new URL(path, import.meta.url).pathname;
  return (await readFile(resolvedPath)).toString();
};

/**
 * The main function for the script.
 *
 * @param {*} param0 - An arguments bag.
 * @param { string } param0.model - The model to pull and use.
 * @param { string } param0.prompt - The prompt to give the model.
 */
async function main({ model, prompt }) {
  if (!prompt) {
    throw new Error('say something');
  }

  console.log('OLLAMA', 'pull');

  await ollama.pull({ model });

  console.log('USER:', prompt);

  const response = await ollama.chat({
    model, // Specify the model you want to use
    messages: [
      {
        role: 'admin',
        content: [
          `You are an instance of LLM model ${model}.`,
          `Respond to user requests ${'respectfully'} and ${'informatively'}.`,
        ].join(' '),
      },
      {
        role: 'admin',
        content: [
          'The following is the raw content of the wikipedia page titled "ambient authority".',
          await getFileContent('./ambient-authority.txt'),
        ].join('\n\n'),
      },
      {
        role: 'admin',
        content: [
          'The following is the raw content of the wikipedia page titled "confused deputy problem".',
          await getFileContent('./confused-deputy-problem.txt'),
        ].join('\n\n'),
      },
      { role: 'user', content: prompt },
    ], // The message to send
    stream: true, // Enable streaming
  });

  await streamResponse(response).catch(console.error);
  console.log('\n'); // Add a newline after the streaming response
}

const model = 'deepseek-r1:1.5b';

const [, , prompt] = process.argv;

main({ model, prompt }).catch(console.error);
