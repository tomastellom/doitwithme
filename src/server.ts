import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { describeWarnings, replan } from './replan.ts';
import { loadState, saveState } from './store.ts';
import type { State } from './types.ts';
import {
  ValidationError,
  validateDismissRequest,
  validateReplanRequest,
  validateSoftRequest,
  validateState,
} from './validate.ts';

const MAX_BODY = 1_000_000;
const MAX_LIST = 400;
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

interface Clock {
  today: string;
  nowMinutes?: number;
  horizonDays: number;
}

function replanAndSave(statePath: string, state: State, clock: Clock) {
  const result = replan(state, clock.today, clock.nowMinutes, clock.horizonDays);
  saveState(statePath, result.state);
  return {
    blocks: result.state.blocks,
    warnings: describeWarnings(result.warnings, result.state.dismissed),
    approvedSoft: result.state.approvedSoft,
    dismissed: result.state.dismissed,
  };
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
        return send(res, 200, replanAndSave(statePath, loadState(statePath), request));
      }
      if (req.method === 'POST' && pathname === '/api/soft/approve') {
        const request = validateSoftRequest(await readJson(req));
        if (request.date < request.today) throw new HttpError(400, 'date must not be in the past');
        const state = loadState(statePath);
        if (!state.approvedSoft.includes(request.date)) {
          if (state.approvedSoft.length >= MAX_LIST) throw new HttpError(400, 'too many approved dates');
          state.approvedSoft = [...state.approvedSoft, request.date];
        }
        return send(res, 200, replanAndSave(statePath, state, request));
      }
      if (req.method === 'POST' && pathname === '/api/soft/undo') {
        const request = validateSoftRequest(await readJson(req));
        const state = loadState(statePath);
        state.approvedSoft = state.approvedSoft.filter((d) => d !== request.date);
        return send(res, 200, replanAndSave(statePath, state, request));
      }
      if (req.method === 'POST' && pathname === '/api/warnings/dismiss') {
        const request = validateDismissRequest(await readJson(req));
        const state = loadState(statePath);
        if (!state.dismissed.includes(request.key)) {
          if (state.dismissed.length >= MAX_LIST) throw new HttpError(400, 'too many dismissed warnings');
          state.dismissed = [...state.dismissed, request.key];
        }
        return send(res, 200, replanAndSave(statePath, state, request));
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
