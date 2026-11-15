// Фейковий GitHub (Git Data API) для перевірки синхронізації двох пристроїв.
import { createHash } from 'node:crypto';
const sha1 = buf => createHash('sha1').update(buf).digest('hex');
const blobSha = bytes => sha1(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]));

export function createFake({ users }) {
  // users: { token: login }
  const repos = {}; // 'o/r' → { blobs: Map, trees: Map(sha → Map(path→sha)), commits: Map, head: null, members: Set(login) }
  const stats = { requests: 0, byRoute: {} };
  const repo = (o, r) => repos[`${o}/${r}`];
  function addRepo(full, members) { repos[full] = { blobs: new Map(), trees: new Map(), commits: new Map(), head: null, members: new Set(members) }; return repos[full]; }
  function commit(R, files, message, parent) {
    const treeSha = sha1('tree' + JSON.stringify([...files.entries()].sort()) + Math.random());
    R.trees.set(treeSha, files);
    const c = { sha: sha1('commit' + treeSha + parent + Math.random()), tree: treeSha, parents: parent ? [parent] : [], message, date: new Date().toISOString() };
    R.commits.set(c.sha, c); return c;
  }
  async function handle(route) {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const H = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'content-type': 'application/json' };
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: H });
    stats.requests++;
    const send = (status, body) => route.fulfill({ status, headers: H, body: body === undefined ? '' : JSON.stringify(body) });
    const auth = (req.headers()['authorization'] || '').replace(/^Bearer /, '');
    const login = users[auth];
    if (!login) return send(401, { message: 'Bad credentials' });
    const p = url.pathname;
    const key = method + ' ' + p.replace(/\/repos\/[^/]+\/[^/]+/, '/R').replace(/[0-9a-f]{40}/g, ':sha');
    stats.byRoute[key] = (stats.byRoute[key] || 0) + 1;
    if (p === '/user') return send(200, { login });
    const m = /^\/repos\/([^/]+)\/([^/]+)(\/.*)?$/.exec(p);
    if (!m) return send(404, { message: 'Not Found' });
    const R = repo(decodeURIComponent(m[1]), decodeURIComponent(m[2]));
    if (!R || !R.members.has(login)) return send(404, { message: 'Not Found' });
    const rest = m[3] || '';
    const body = req.postData() ? JSON.parse(req.postData()) : null;
    if (!rest) return send(200, { full_name: `${m[1]}/${m[2]}`, default_branch: 'main', private: true, permissions: { push: true } });
    if (rest === '/git/ref/heads/main' && method === 'GET') {
      if (!R.head) return send(409, { message: 'Git Repository is empty.' });
      return send(200, { ref: 'refs/heads/main', object: { sha: R.head, type: 'commit' } });
    }
    let x;
    if ((x = /^\/contents\/(.+)$/.exec(rest))) {
      if (method === 'PUT') {
        const bytes = Buffer.from(body.content, 'base64'); const s = blobSha(bytes); R.blobs.set(s, bytes);
        const files = new Map(R.head ? R.trees.get(R.commits.get(R.head).tree) : []); files.set(x[1], s);
        const c = commit(R, files, body.message, R.head); R.head = c.sha;
        return send(201, { content: { sha: s }, commit: { sha: c.sha } });
      }
      const ref = url.searchParams.get('ref') || R.head; const c = R.commits.get(ref); const s = c && R.trees.get(c.tree).get(x[1]);
      if (!s) return send(404, { message: 'Not Found' });
      return send(200, { content: R.blobs.get(s).toString('base64'), encoding: 'base64', sha: s });
    }
    if ((x = /^\/git\/commits\/([0-9a-f]+)$/.exec(rest))) { const c = R.commits.get(x[1]); return c ? send(200, { sha: c.sha, tree: { sha: c.tree }, parents: c.parents.map(sha => ({ sha })) }) : send(404, {}); }
    if ((x = /^\/git\/trees\/([0-9a-f]+)$/.exec(rest)) && method === 'GET') {
      const t = R.trees.get(x[1]); if (!t) return send(404, {});
      return send(200, { sha: x[1], tree: [...t.entries()].map(([path, sha]) => ({ path, mode: '100644', type: 'blob', sha })), truncated: false });
    }
    if ((x = /^\/git\/blobs\/([0-9a-f]+)$/.exec(rest))) { const b = R.blobs.get(x[1]); return b ? send(200, { sha: x[1], content: b.toString('base64'), encoding: 'base64' }) : send(404, {}); }
    if (rest === '/git/blobs' && method === 'POST') { const bytes = Buffer.from(body.content, body.encoding === 'base64' ? 'base64' : 'utf8'); const s = blobSha(bytes); R.blobs.set(s, bytes); return send(201, { sha: s }); }
    if (rest === '/git/trees' && method === 'POST') {
      const files = new Map(body.base_tree ? R.trees.get(body.base_tree) : []);
      for (const e of body.tree) {
        if (e.sha === null) { files.delete(e.path); continue; }
        if (e.content !== undefined) { const bytes = Buffer.from(e.content, 'utf8'); const s = blobSha(bytes); R.blobs.set(s, bytes); files.set(e.path, s); }
        else files.set(e.path, e.sha);
      }
      const tsha = sha1('tree' + JSON.stringify([...files.entries()].sort()) + Math.random()); R.trees.set(tsha, files);
      return send(201, { sha: tsha });
    }
    if (rest === '/git/commits' && method === 'POST') {
      const c = { sha: sha1('c' + body.tree + Math.random()), tree: body.tree, parents: body.parents, message: body.message, date: new Date().toISOString(), author: login };
      R.commits.set(c.sha, c); return send(201, { sha: c.sha });
    }
    if (rest === '/git/refs/heads/main' && method === 'PATCH') {
      const c = R.commits.get(body.sha);
      if (!c || c.parents[0] !== R.head) return send(422, { message: 'Update is not a fast forward' });
      R.head = c.sha; return send(200, { object: { sha: c.sha } });
    }
    if (rest === '/commits' && method === 'GET') {
      const path = url.searchParams.get('path'); const out = [];
      let cur = R.head;
      while (cur) { const c = R.commits.get(cur); const par = c.parents[0] && R.commits.get(c.parents[0]); const a = R.trees.get(c.tree).get(path), b = par ? R.trees.get(par.tree).get(path) : undefined; if (a !== b && a) out.push({ sha: c.sha, commit: { message: c.message, author: { name: c.author || 'x', date: c.date } }, author: { login: c.author || 'x' } }); cur = c.parents[0]; }
      return send(200, out);
    }
    return send(404, { message: 'unhandled ' + method + ' ' + rest });
  }
  const files = full => { const R = repos[full]; if (!R || !R.head) return {}; const t = R.trees.get(R.commits.get(R.head).tree); return Object.fromEntries([...t.entries()].map(([p, s]) => [p, R.blobs.get(s).toString('utf8')])); };
  return { handle, addRepo, files, stats, repos };
}
