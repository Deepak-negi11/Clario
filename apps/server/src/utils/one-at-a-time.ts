// A queue that runs work with the same key one at a time, in the order it was asked for. A failed
// run doesn't stop the ones queued after it.
export function oneAtATime() {
  const queues = new Map<string, Promise<unknown>>();

  return <T>(key: string, work: () => Promise<T>): Promise<T> => {
    const run = (queues.get(key) ?? Promise.resolve()).then(work, work);
    const settled = run.catch(() => undefined);
    queues.set(key, settled);
    void settled.then(() => {
      if (queues.get(key) === settled) queues.delete(key);
    });
    return run;
  };
}
