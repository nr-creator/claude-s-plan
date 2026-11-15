// Мінімальний клієнт GitHub REST API. Токен іде лише в заголовок Authorization запитів до api.github.com.
export class GhError extends Error {
  constructor(status, code, msg) { super(msg || code); this.status = status; this.code = code; }
}
const API = 'https://api.github.com';

export async function gh(remote, method, path, body) {
  let res;
  try {
    res = await fetch(API + path, {
      method,
      headers: {
        Authorization: 'Bearer ' + remote.token,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
  } catch (e) { throw new GhError(0, 'net', e.message); }
  if (res.status === 204) return null;
  let data = null;
  try { data = await res.json(); } catch { /* порожня відповідь */ }
  if (!res.ok) {
    const msg = (data && data.message) || res.statusText;
    if (res.status === 403 && (res.headers.get('x-ratelimit-remaining') === '0' || /rate limit/i.test(msg))) throw new GhError(403, 'rate', msg);
    if (res.status === 429) throw new GhError(429, 'rate', msg);
    throw new GhError(res.status, String(res.status), msg);
  }
  return data;
}

const repoPath = r => `/repos/${encodeURIComponent(r.owner)}/${encodeURIComponent(r.repo)}`;
export const api = {
  user: r => gh(r, 'GET', '/user'),
  repo: r => gh(r, 'GET', repoPath(r)),
  ref: r => gh(r, 'GET', `${repoPath(r)}/git/ref/heads/${encodeURIComponent(r.branch || 'main')}`),
  commit: (r, sha) => gh(r, 'GET', `${repoPath(r)}/git/commits/${sha}`),
  tree: (r, sha) => gh(r, 'GET', `${repoPath(r)}/git/trees/${sha}?recursive=1`),
  blob: (r, sha) => gh(r, 'GET', `${repoPath(r)}/git/blobs/${sha}`),
  createBlob: (r, b64) => gh(r, 'POST', `${repoPath(r)}/git/blobs`, { content: b64, encoding: 'base64' }),
  createTree: (r, base, tree) => gh(r, 'POST', `${repoPath(r)}/git/trees`, base ? { base_tree: base, tree } : { tree }),
  createCommit: (r, message, tree, parents) => gh(r, 'POST', `${repoPath(r)}/git/commits`, { message, tree, parents }),
  updateRef: (r, sha) => gh(r, 'PATCH', `${repoPath(r)}/git/refs/heads/${encodeURIComponent(r.branch || 'main')}`, { sha, force: false }),
  putFile: (r, path, b64, message) => gh(r, 'PUT', `${repoPath(r)}/contents/${path}`, { message, content: b64, branch: r.branch || 'main' }),
  commits: (r, path) => gh(r, 'GET', `${repoPath(r)}/commits?path=${encodeURIComponent(path)}&sha=${encodeURIComponent(r.branch || 'main')}&per_page=40`),
  fileAt: (r, path, ref) => gh(r, 'GET', `${repoPath(r)}/contents/${path}?ref=${ref}`),
};
