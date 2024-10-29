chrome.devtools.panels.create(
  'Kernel',
  'icon.png',
  'devtools/panel.html',
  () => {
    console.log('Kernel DevTools panel created');
  },
);
