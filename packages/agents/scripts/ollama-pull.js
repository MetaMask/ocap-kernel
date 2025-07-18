import { Ollama } from 'ollama';

main().catch(console.error);

/**
 * The main function for the script.
 */
async function main() {
  // Make a new ollama client.
  const ollama = new Ollama({ host: 'http://localhost:11434' });

  let nDots = 0;
  const interval = setInterval(() => (nDots = (nDots + 1) % 4), 250);
  try {
    const model = process.argv[2];
    const labelDuring = `Pulling ${model}`;
    const labelAfter = `Pulled ${model}`;
    const makeProgress = (fraction) =>
      [
        labelDuring,
        `${'.'.repeat(nDots)}${' '.repeat(4 - nDots)}`,
        '[',
        `${'='.repeat(Math.floor(fraction * 10))}`,
        `${' '.repeat(10 - Math.floor(fraction * 10))}`,
        ']',
        ` ${Math.floor(fraction * 100)}%`,
      ].join('');
    const result = await ollama.pull({ model, stream: true });
    for await (const chunk of result) {
      process.stdout.write(`${makeProgress(chunk.completed / chunk.total)}\r`);
    }
    console.log(
      `${labelAfter} ${' '.repeat(15 + labelDuring.length - labelAfter.length)}`,
    );
  } finally {
    clearInterval(interval);
  }
}
