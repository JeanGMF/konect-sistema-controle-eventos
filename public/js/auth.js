document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const recoverForm = document.getElementById('recoverForm');

  if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const body = formDataToObject(loginForm);
        const result = await API.request('/api/auth/login', {
          method: 'POST',
          body
        });
        API.token = result.token;
        API.user = result.user;
        showMessage('formMessage', result.message);
        location.href = 'home.html';
      } catch (error) {
        showMessage('formMessage', error.message, true);
      }
    });
  }

  if (registerForm) {
    registerForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const body = formDataToObject(registerForm);
        const result = await API.request('/api/auth/register', {
          method: 'POST',
          body
        });
        showMessage('formMessage', `${result.message} Agora você já pode fazer login.`);
        registerForm.reset();
      } catch (error) {
        showMessage('formMessage', error.message, true);
      }
    });
  }

  if (recoverForm) {
    recoverForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const body = formDataToObject(recoverForm);
        const result = await API.request('/api/auth/recover', {
          method: 'POST',
          body
        });
        showMessage('formMessage', result.message);
      } catch (error) {
        showMessage('formMessage', error.message, true);
      }
    });
  }
});
