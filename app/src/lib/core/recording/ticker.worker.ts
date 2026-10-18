/**
 * Recording ticker (doc 06 s.5): a worker whose timer keeps firing while
 * the tab is hidden, driving the 25 fps compositor. 40 ms = 25 fps.
 */

setInterval(() => {
  self.postMessage('tick');
}, 40);

export {};
