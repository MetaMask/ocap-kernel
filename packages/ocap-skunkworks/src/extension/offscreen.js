chrome.runtime.onMessage.addListener(handleMessage);

async function handleMessage(message) {
  if (message.target !== 'offscreen') {
    return;
  }

  switch (message.type) {
    case 'greetings':
      reply('salutations', `Good day to you, ${message.data.name}!`);
      break;
    default:
      console.error(`Received unexpected message type: "${message.type}"`);
  }
}

function reply(type, data) {
  chrome.runtime.sendMessage({
    data,
    target: 'background',
    type,
  });
}
