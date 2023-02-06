console.log('Dev: started');

let running = false;
const intervalId = setInterval(() => {
  if (!running) {
    console.log('Dev: running');

    running = true;
  }
}, 1000);

process.on('SIGINT', () => {
  console.log('Dev: received SIGINT; gracefully terminating');

  setTimeout(() => {
    clearInterval(intervalId);
    console.log('Dev: exiting');
  }, 1000);
});

process.on('SIGTERM', () => {
  console.log('Dev: received SIGTERM; gracefully terminating');

  setTimeout(() => {
    clearInterval(intervalId);
    console.log('Dev: exiting');
  }, 1000);
});
