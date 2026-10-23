// Loaded with `tsx --import` by tests that run a script: any network call fails at once.
globalThis.fetch = async () => {
  throw new Error("no network in this test");
};
