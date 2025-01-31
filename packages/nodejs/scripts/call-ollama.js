import ollama from 'ollama';

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
  process.stdout.write('OLLAMA: ');

  const response = await ollama.chat({
    model, // Specify the model you want to use
    messages: [
      { role: 'admin', content: [
        `You are an instance of LLM model ${model}.`,
        `Respond to user requests ${'respectfully'} and ${'informatively'}.`,
      ].join(' ')},
      { role: 'user', content: prompt }
    ], // The message to send
    stream: true // Enable streaming
  });

  let accumulatedContent = '';
  for await (const part of response) {
    accumulatedContent += part.message.content;
    process.stdout.write(part.message.content); // Write each part of the response to the console
  }
  console.log('\n'); // Add a newline after the streaming response
}

const model = 'deepseek-r1:1.5b';

const [,, prompt] = process.argv;

main({ model, prompt }).catch(console.error);
