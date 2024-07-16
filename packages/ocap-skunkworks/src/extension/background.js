const OFFSCREEN_DOCUMENT_PATH = '/offscreen.html';

// Send
chrome.action.onClicked.addListener(async () => {
  sendMessage(
    'greetings',
    { name: 'Kernel' },
  );
});

async function sendMessage(type, data) {
  await provideOffScreenDocument();

  chrome.runtime.sendMessage({
    type,
    target: 'offscreen',
    data
  });
}

async function provideOffScreenDocument() {
  if (!(await hasDocument())) {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT_PATH,
      reasons: [chrome.offscreen.Reason.IFRAME_SCRIPTING],
      justification: `Surely you won't object to our capabilities?`,
    });
  }
}

// Receive
chrome.runtime.onMessage.addListener(handleMessage);

async function handleMessage(message) {
  if (message.target !== 'background') {
    return;
  }

  switch (message.type) {
    case 'salutations':
      console.log(message.data);
      closeOffscreenDocument();
      break;
    default:
      console.error(`Received unexpected message type: "${message.type}"`);
  }
}

async function closeOffscreenDocument() {
  if (!(await hasDocument())) {
    return;
  }
  await chrome.offscreen.closeDocument();
}

async function hasDocument() {
  const allClients = await clients.matchAll();
  for (const client of allClients) {
    if (client.url.endsWith(OFFSCREEN_DOCUMENT_PATH)) {
      return true;
    }
  }
  return false;
}
