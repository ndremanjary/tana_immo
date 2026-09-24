export type Logger = {
  error: (message: string, error?: unknown) => void;
};

export const consoleLogger: Logger = {
  error(message, error) {
    const detail = error instanceof Error ? error.message : "";
    console.error(message, detail);
  },
};
