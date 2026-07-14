export type ReadLaterMutationCoordinator = {
  run<T>(itemId: string, operation: () => Promise<T>): Promise<T>;
};

export function createReadLaterMutationCoordinator(): ReadLaterMutationCoordinator {
  const tails = new Map<string, Promise<unknown>>();

  return {
    run<T>(itemId: string, operation: () => Promise<T>) {
      const previous = tails.get(itemId) ?? Promise.resolve();
      const current = previous.catch(() => undefined).then(operation);
      const settled = current.then(
        () => undefined,
        () => undefined,
      );
      tails.set(itemId, settled);
      void settled.finally(() => {
        if (tails.get(itemId) === settled) tails.delete(itemId);
      });
      return current;
    },
  };
}

export const readLaterMutationCoordinator = createReadLaterMutationCoordinator();

export function nextReadLaterMutationError(
  result: { ok: true } | { ok: false; error: string },
) {
  return result.ok ? null : result.error;
}
