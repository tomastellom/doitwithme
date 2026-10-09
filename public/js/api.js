export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function createApi(fetchFn) {
  async function call(method, path, body) {
    let res;
    try {
      res = await fetchFn(path, {
        method,
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, 'The planner is not reachable');
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) throw new ApiError(res.status, (data && data.error) || `Request failed (${res.status})`);
    return data;
  }

  return {
    getState: () => call('GET', '/api/state'),
    putState: (state) => call('PUT', '/api/state', state),
    example: () => call('GET', '/api/example'),
    estimate: (body) => call('POST', '/api/estimate', body),
    commuteStatus: () => call('GET', '/api/commute/status'),
    replan: (clock) => call('POST', '/api/replan', clock),
    approve: (date, clock) => call('POST', '/api/soft/approve', { ...clock, date }),
    undo: (date, clock) => call('POST', '/api/soft/undo', { ...clock, date }),
    dismiss: (key, clock) => call('POST', '/api/warnings/dismiss', { ...clock, key }),
  };
}
