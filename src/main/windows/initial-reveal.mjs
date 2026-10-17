

function createInitialWindowReveal(options) {
  const schedule = options.schedule ?? setTimeout;
  const cancel = options.cancel ?? clearTimeout;
  const retryDelays = [100, 250, 500, 1e3];
  let complete = false;
  let retryIndex = 0;
  let timer;
  function attempt(reason) {
    if (complete || timer !== void 0) return;
    try {
      if (options.reveal()) {
        complete = true;
        options.onVisible(reason);
        return;
      }
    } catch (error) {
      options.onError(error, reason);
    }
    const delay = retryDelays[retryIndex++];
    if (delay === void 0) return;
    timer = schedule(() => {
      timer = void 0;
      attempt(`${reason}:retry`);
    }, delay);
  }
  return {
    attempt,
    dispose() {
      complete = true;
      if (timer !== void 0) cancel(timer);
      timer = void 0;
    }
  };
}

export { createInitialWindowReveal };
