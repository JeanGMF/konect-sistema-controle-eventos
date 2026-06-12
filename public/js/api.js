const API = {
  get token() {
    return localStorage.getItem('konect_token');
  },

  set token(value) {
    if (value) localStorage.setItem('konect_token', value);
    else localStorage.removeItem('konect_token');
  },

  get user() {
    const stored = localStorage.getItem('konect_user');
    return stored ? JSON.parse(stored) : null;
  },

  set user(value) {
    if (value) localStorage.setItem('konect_user', JSON.stringify(value));
    else localStorage.removeItem('konect_user');
  },

  async request(path, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    if (API.token) {
      headers.Authorization = `Bearer ${API.token}`;
    }

    const response = await fetch(path, {
      ...options,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 401 && !location.pathname.endsWith('/index.html')) {
        API.token = null;
        API.user = null;
        location.href = 'index.html';
      }
      throw new Error(data.message || 'Erro ao processar a solicitação.');
    }

    return data;
  }
};

function showMessage(elementId, text, isError = false) {
  const element = document.getElementById(elementId);
  if (!element) return;
  element.textContent = text;
  element.classList.add('show');
  element.classList.toggle('error', isError);
}

function formDataToObject(form) {
  return Object.fromEntries(new FormData(form).entries());
}
