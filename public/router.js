// Router SPA por hash, compatible con hosting estático (GitHub Pages/Vercel/Netlify).
// Rutas tipo: #/cursos, #/cursos/:courseId, #/cursos/:courseId/modulo/:moduleId, #/leccion/:lessonId, #/actividad/:activityId

export function getHashPath() {
  const raw = (location.hash || "#/").replace(/^#/, "");
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  return path.replace(/\/+$/, "") || "/";
}

function splitPath(path) {
  return path.split("/").filter(Boolean);
}

function matchRoute(routePattern, path) {
  const a = splitPath(routePattern);
  const b = splitPath(path);
  if (a.length !== b.length) return null;
  const params = {};
  for (let i = 0; i < a.length; i++) {
    const pa = a[i];
    const pb = b[i];
    if (pa.startsWith(":")) {
      params[pa.slice(1)] = decodeURIComponent(pb);
      continue;
    }
    if (pa !== pb) return null;
  }
  return params;
}

export class Router {
  constructor() {
    this._routes = [];
    this._onChange = this._onChange.bind(this);
  }

  add(pattern, handler) {
    this._routes.push({ pattern, handler });
    return this;
  }

  start() {
    window.addEventListener("hashchange", this._onChange);
    window.addEventListener("popstate", this._onChange);
    this._onChange();
  }

  go(path) {
    const next = path.startsWith("#") ? path : `#${path.startsWith("/") ? "" : "/"}${path}`;
    if (location.hash === next) return;
    location.hash = next;
  }

  _onChange() {
    const path = getHashPath();
    for (const r of this._routes) {
      const params = matchRoute(r.pattern, path);
      if (!params) continue;
      r.handler({ path, params });
      return;
    }
    // Fallback
    const root = this._routes.find((x) => x.pattern === "/");
    if (root) root.handler({ path: "/", params: {} });
  }
}

