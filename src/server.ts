import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { replan } from './replan.ts';
import { loadState, saveState } from './store.ts';
import { ValidationError, validateReplanRequest, validateState } from './validate.ts';

const MAX_BODY = 1_000_000;
const ALLOWED_HOSTS = /^(localhost|127\.0\.0\.1)(:\d+)?$/;

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const type = req.headers['content-type'] ?? '';
  if (!type.startsWith('application/json')) {
    throw new HttpError(415, 'Content-Type must be application/json');
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, 'Body is too large');
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Body is not valid JSON');
  }
}

export function createApp(statePath: string): Server {
  return createServer(async (req, res) => {
    try {
      if (!ALLOWED_HOSTS.test(req.headers.host ?? '')) throw new HttpError(403, 'Forbidden host');
      const { pathname } = new URL(req.url ?? '/', 'http://localhost');

      if (req.method === 'GET' && pathname === '/api/state') {
        return send(res, 200, loadState(statePath));
      }
      if (req.method === 'PUT' && pathname === '/api/state') {
        const state = validateState(await readJson(req));
        saveState(statePath, state);
        return send(res, 200, { ok: true });
      }
      if (req.method === 'POST' && pathname === '/api/replan') {
        const request = validateReplanRequest(await readJson(req));
        const result = replan(loadState(statePath), request.today, request.nowMinutes, request.horizonDays);
        saveState(statePath, result.state);
        return send(res, 200, { blocks: result.state.blocks, warnings: result.warnings });
      }
      throw new HttpError(404, 'Not found');
    } catch (err) {
      const status = err instanceof HttpError ? err.status : err instanceof ValidationError ? 400 : 500;
      send(res, status, { error: err instanceof Error ? err.message : String(err) });
    }
  });
}

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 8787);
  const file = process.env.DATA_FILE ?? 'data/db.json';
  createApp(file).listen(port, '127.0.0.1', () => {
    console.log(`Listening on http://127.0.0.1:${port} (data file: ${file})`);
  });
}
