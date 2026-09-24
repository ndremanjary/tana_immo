type AppConfig = {
  port: number;
  webhookSecret: string;
};

export function readConfig(env: NodeJS.ProcessEnv): AppConfig {
  const webhookSecret = env.WEBHOOK_SECRET?.trim() ?? "";
  const port = Number(env.PORT ?? "3000");

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT invalide.");
  }

  return { port, webhookSecret };
}
