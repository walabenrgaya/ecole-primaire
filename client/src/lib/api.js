// Client HTTP de l'API (jeton JWT + contexte d'établissement pour le super-admin)
const store = {
  get token() { try { return localStorage.getItem('ep_token') || ''; } catch { return ''; } },
  get school() { try { return localStorage.getItem('ep_school') || ''; } catch { return ''; } }
};

export class ApiError extends Error {
  constructor(status, data) {
    super(data?.error || 'Une erreur est survenue');
    this.status = status;
    this.data = data || {};
  }
}

function headers(json = true) {
  const h = {};
  if (json) h['Content-Type'] = 'application/json';
  if (store.token) h.Authorization = `Bearer ${store.token}`;
  if (store.school) h['x-school-id'] = store.school;
  return h;
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = fn => { onUnauthorized = fn; };

export async function api(path, { method = 'GET', body, raw } = {}) {
  const isForm = body instanceof FormData;
  const res = await fetch(`/api${path}`, {
    method,
    headers: headers(!isForm && body !== undefined && typeof body !== 'string'),
    body: body === undefined ? undefined : isForm || typeof body === 'string' ? body : JSON.stringify(body)
  });
  if (raw) {
    if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => ({})));
    return res;
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && store.token && !path.startsWith('/auth/login')) onUnauthorized();
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const get = (p) => api(p);
export const post = (p, body) => api(p, { method: 'POST', body: body ?? {} });
export const put = (p, body) => api(p, { method: 'PUT', body });
export const del = (p) => api(p, { method: 'DELETE' });

/** Ouvre un fichier protégé (PDF, CSV) dans un nouvel onglet ou le télécharge. */
export async function openFile(path, { download } = {}) {
  const win = download ? null : window.open('', '_blank');
  try {
    const res = await api(path, { raw: true });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    if (download) {
      const a = document.createElement('a');
      a.href = url; a.download = download; document.body.appendChild(a); a.click(); a.remove();
    } else if (win) {
      win.location.href = url;
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    win?.close();
    throw e;
  }
}

export async function upload(file) {
  const fd = new FormData();
  fd.append('file', file);
  return api('/upload', { method: 'POST', body: fd });
}
