/** Node HTTP server for the app. Always binds the loopback interface; there is no option to change the host. */
import { serve, type ServerType } from '@hono/node-server';
import type { AddressInfo } from 'node:net';

export const HOST = '127.0.0.1';

export function createServer(
  app: { fetch: (request: Request) => Response | Promise<Response> },
  port: number,
  onListen?: (info: AddressInfo) => void,
): ServerType {
  return serve({ fetch: app.fetch, port, hostname: HOST }, onListen);
}
