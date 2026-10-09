import { unavailableProvider } from './maps.ts';
import type { TravelTimeProvider } from './maps.ts';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addDays, weekdayOf } from './dates.ts';
import { describeWarnings, replan, warningKey } from './replan.ts';
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

const HEADERS = {
  'content-security-policy':
    "default-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const DEFAULT_PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));
const DEFAULT_EXAMPLE = fileURLToPath(new URL('../examples/sample-state.json', import.meta.url));

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { ...HEADERS, 'content-type': 'application/json' });
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

function replanned(state: State, clock: Clock) {
  const result = replan(state, clock.today, clock.nowMinutes, clock.horizonDays);
  return {
    result,
    body: {
      blocks: result.state.blocks,
      warnings: describeWarnings(result.warnings, result.state.dismissed),
      approvedSoft: result.state.approvedSoft,
      dismissed: result.state.dismissed,
      travel: result.travel,
    },
  };
}

function replanAndSave(statePath: string, state: State, clock: Clock) {
  const { result, body } = replanned(state, clock);
  saveState(statePath, result.state);
  return body;
}

function serveStatic(publicDir: string, pathname: string, method: string, res: ServerResponse): void {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    throw new HttpError(400, 'Bad path');
  }
  if (decoded.includes('\0') || decoded.includes('\\')) throw new HttpError(404, 'Not found');
  if (decoded.split('/').some((segment) => segment.startsWith('.'))) throw new HttpError(404, 'Not found');
  let root: string;
  try {
    root = realpathSync(publicDir);
  } catch {
    throw new HttpError(404, 'Not found');
  }
  const relative = decoded.endsWith('/') ? `${decoded}index.html` : decoded;
  const full = resolve(root, `.${relative}`);
  if (full !== root && !full.startsWith(root + sep)) throw new HttpError(404, 'Not found');
  const type = TYPES[extname(full).toLowerCase()];
  if (!type) throw new HttpError(404, 'Not found');
  let real: string;
  try {
    real = realpathSync(full);
  } catch {
    throw new HttpError(404, 'Not found');
  }
  if (!real.startsWith(root + sep) || !statSync(real).isFile()) throw new HttpError(404, 'Not found');
  res.writeHead(200, { ...HEADERS, 'content-type': type, 'cache-control': 'no-store' });
  res.end(method === 'HEAD' ? undefined : readFileSync(real));
}

export function createApp(
  statePath: string,
  options: { publicDir?: string; exampleFile?: string; maps?: TravelTimeProvider } = {},
): Server {
  const publicDir = options.publicDir ?? DEFAULT_PUBLIC;
  const exampleFile = options.exampleFile ?? DEFAULT_EXAMPLE;
  const maps = options.maps ?? unavailableProvider;
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
        if (request.date > addDays(request.today, 60)) throw new HttpError(400, 'date is too far ahead');
        const state = loadState(statePath);
        if (!state.preferences.softWindows.some((s) => s.weekday === weekdayOf(request.date))) {
          throw new HttpError(400, 'date is not a soft evening');
        }
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
        const { result, body } = replanned(state, request);
        if (!result.warnings.some((w) => warningKey(w) === request.key)) {
          throw new HttpError(409, 'That warning is no longer open');
        }
        saveState(statePath, result.state);
        return send(res, 200, body);
      }
      if (req.method === 'GET' && pathname === '/api/commute/status') {
        return send(res, 200, { maps: maps.status });
      }
      if (req.method === 'GET' && pathname === '/api/example') {
        let example: State;
        try {
          example = validateState(JSON.parse(readFileSync(exampleFile, 'utf8')));
        } catch {
          throw new HttpError(500, 'The example schedule could not be read');
        }
        return send(res, 200, example);
      }
      if ((req.method === 'GET' || req.method === 'HEAD') && !pathname.startsWith('/api/')) {
        return serveStatic(publicDir, pathname, req.method, res);
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
