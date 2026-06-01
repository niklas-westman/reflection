import { startManagedServer, type ManagedServer, type ServerConfig, type StartManagedServerOptions } from '../../core/server-manager.js';
import { loadStorybookIndex, type StorybookIndex } from './index-json.js';

export type StorybookServer = {
  baseUrl: string;
  index: StorybookIndex;
  server: ManagedServer;
};

export async function startStorybookServer(
  config: ServerConfig,
  options: StartManagedServerOptions = {}
): Promise<StorybookServer> {
  const server = await startManagedServer(
    {
      ...config,
      readyUrl: storybookIndexUrl(config.readyUrl)
    },
    options
  );

  try {
    return {
      baseUrl: config.readyUrl,
      index: await loadStorybookIndex(config.readyUrl),
      server
    };
  } catch (error) {
    await server.stop();
    throw error;
  }
}

function storybookIndexUrl(baseUrl: string): string {
  return new URL('index.json', baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString();
}
