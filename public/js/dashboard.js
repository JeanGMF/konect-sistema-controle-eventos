let events = [];
let notifications = [];
let selectedEventId = null;
let activeTab = 'guests';
const PHONE_ERROR_MESSAGE = 'O telefone deve conter apenas números e ter entre 10 e 11 dígitos.';

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});

function protectPage() {
  if (!API.token) {
    location.href = 'index.html';
    return false;
  }
  return true;
}

function getSelectedEvent() {
  return events.find((event) => event.id === selectedEventId) || null;
}

async function loadMe() {
  const { user } = await API.request('/api/me');
  API.user = user;
  document.getElementById('userName').textContent = `${user.nome} ${user.sobrenome}`;
}

async function loadEvents() {
  events = await API.request('/api/events');
  if (selectedEventId && !events.some((event) => event.id === selectedEventId)) {
    selectedEventId = null;
  }
  renderStats();
  renderEventList();
  renderDetails();
}


async function loadNotifications() {
  const data = await API.request('/api/notifications');
  notifications = data.notifications || [];
  renderNotifications(data.unread || 0);
}

function renderNotifications(unread = 0) {
  const container = document.getElementById('notificationList');
  if (!container) return;

  if (!notifications.length) {
    container.innerHTML = '<p class="event-meta">Nenhuma notificação por enquanto.</p>';
    return;
  }

  container.innerHTML = `
    <div class="notifications-actions">
      <p class="event-meta">${unread} notificação(ões) não lida(s).</p>
      <button type="button" class="clear-notifications-btn" onclick="clearNotifications()">Limpar notificações</button>
    </div>
    ${notifications.map((notification) => `
      <article class="notification-item ${notification.read ? '' : 'unread'}">
        <div class="notification-header">
          <strong>${escapeHtml(notification.title)}</strong>
          <span class="notification-status">${notification.read ? 'Lida' : 'Não lida'}</span>
        </div>
        <span>${escapeHtml(notification.message)}</span>
        <small>${formatDateTime(notification.createdAt)}</small>
        ${notification.read ? '' : `<button type="button" class="text-button" onclick="markNotificationRead('${notification.id}')">Marcar como lida</button>`}
      </article>
    `).join('')}
  `;
}

async function downloadReport(format) {
  const isPdf = format === 'pdf';
  const url = isPdf ? '/api/reports/events/pdf' : '/api/reports/events/excel';
  const filename = isPdf ? 'KONECT_relatorio_eventos.pdf' : 'KONECT_relatorio_eventos.xls';

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${API.token}` }
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.message || 'Não foi possível gerar o relatório.');
    }

    const blob = await response.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);

    showMessage('reportMessage', `Relatório ${isPdf ? 'PDF' : 'Excel'} gerado com sucesso.`);
    await loadNotifications();
  } catch (error) {
    showMessage('reportMessage', error.message, true);
  }
}

function renderStats() {
  const totalGuests = events.reduce((total, event) => total + event.summary.totalParticipants, 0);
  const doneTasks = events.reduce((total, event) => total + event.summary.doneTasks, 0);
  const totalTasks = events.reduce((total, event) => total + event.summary.totalTasks, 0);
  const totalBudget = events.reduce((total, event) => total + Number(event.budget || 0), 0);

  document.getElementById('statEvents').textContent = events.length;
  document.getElementById('statGuests').textContent = totalGuests;
  document.getElementById('statTasks').textContent = `${doneTasks}/${totalTasks}`;
  document.getElementById('statBudget').textContent = currency.format(totalBudget);
}

function renderEventList() {
  const container = document.getElementById('eventList');

  if (!events.length) {
    container.innerHTML = '<p class="event-meta">Nenhum evento cadastrado ainda.</p>';
    return;
  }

  container.innerHTML = events.map((event) => `
    <article class="event-card">
      <header>
        <div>
          <h3>${escapeHtml(event.title)}</h3>
          <div class="event-meta">
            ${formatDate(event.date)} ${event.time ? `às ${event.time}` : ''}<br>
            ${escapeHtml(event.location)}<br>
            Capacidade: ${event.summary.capacity} · Vagas livres: ${event.summary.availableSlots}
          </div>
        </div>
        <span class="badge">${escapeHtml(event.status)}</span>
      </header>
      <div class="event-actions">
        <button type="button" onclick="selectEvent('${event.id}')">Abrir</button>
        <button type="button" class="secondary" onclick="editEvent('${event.id}')">Editar</button>
        <button type="button" class="danger" onclick="deleteEvent('${event.id}')">Excluir</button>
      </div>
    </article>
  `).join('');
}

function renderDetails() {
  const event = getSelectedEvent();
  const area = document.getElementById('detailsArea');

  if (!event) {
    area.innerHTML = '<div class="detail-empty">Selecione um evento para abrir o painel de controle.</div>';
    return;
  }

  const template = document.getElementById('detailsTemplate').content.cloneNode(true);
  template.querySelector('[data-field="title"]').textContent = event.title;
  template.querySelector('[data-field="meta"]').textContent = `${formatDate(event.date)} ${event.time ? `às ${event.time}` : ''} · ${event.location} · ${event.type}`;
  template.querySelector('[data-field="status"]').textContent = event.status;
  template.querySelector('[data-field="participants"]').textContent = event.summary.totalParticipants;
  template.querySelector('[data-field="capacity"]').textContent = event.summary.capacity;
  template.querySelector('[data-field="availableSlots"]').textContent = event.summary.availableSlots;
  template.querySelector('[data-field="balance"]').textContent = currency.format(event.summary.balance);

  area.innerHTML = '';
  area.appendChild(template);

  document.querySelectorAll('.tab-btn').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === activeTab);
    button.addEventListener('click', () => {
      activeTab = button.dataset.tab;
      renderDetails();
    });
  });

  renderTabContent(event);
}

function renderTabContent(event) {
  const tabContent = document.getElementById('tabContent');
  if (!tabContent) return;

  const renderers = {
    guests: renderGuests,
    suppliers: renderSuppliers,
    tasks: renderTasks,
    finances: renderFinances
  };

  tabContent.innerHTML = renderers[activeTab](event);
  bindTabForms(event);
}

function renderGuests(event) {
  const isFull = event.summary.isFull;
  const activeGuests = event.guests.filter((guest) => guest.status !== 'Cancelado');
  const canceledGuests = event.guests.filter((guest) => guest.status === 'Cancelado');

  return `
    <h3>Inscrição de participantes</h3>
    <form class="item-form participants-form" data-form="guests">
      <input name="name" placeholder="Nome do participante" required>
      <input name="email" type="email" placeholder="E-mail">
      <input name="phone" type="tel" inputmode="numeric" pattern="[0-9]{10,11}" maxlength="11" placeholder="Telefone" required>
      <input type="hidden" name="status" value="Confirmado">
      <button ${isFull ? 'disabled' : ''}>${isFull ? 'Evento lotado' : 'Inscrever participante'}</button>
    </form>
    <div id="tabMessage" class="message"></div>
    <p class="event-meta">Vagas livres: ${event.summary.availableSlots} de ${event.summary.capacity}</p>
    ${isFull ? '<p class="event-warning">Este evento está lotado. Para liberar vaga, cancele uma inscrição.</p>' : ''}

    <h3>Participantes inscritos</h3>
    ${table(['Nome', 'E-mail', 'Telefone', 'Status', 'Ações'], activeGuests.map((guest) => [
      escapeHtml(guest.name),
      escapeHtml(guest.email || '-'),
      escapeHtml(guest.phone || '-'),
      '<span class="status-ok">Inscrito</span>',
      participantActions(guest)
    ]))}

    ${canceledGuests.length ? `
      <h3>Inscrições canceladas</h3>
      ${table(['Nome', 'E-mail', 'Telefone', 'Status', 'Ações'], canceledGuests.map((guest) => [
        escapeHtml(guest.name),
        escapeHtml(guest.email || '-'),
        escapeHtml(guest.phone || '-'),
        '<span class="status-canceled">Cancelada</span>',
        participantActions(guest)
      ]))}
    ` : ''}
  `;
}

function renderSuppliers(event) {
  return `
    <form class="item-form" data-form="suppliers">
      <input name="name" placeholder="Fornecedor" required>
      <input name="service" placeholder="Serviço">
      <input name="phone" placeholder="Telefone">
      <input name="cost" type="number" min="0" step="0.01" placeholder="Custo">
      <button>Adicionar</button>
    </form>
    ${table(['Nome', 'Serviço', 'Telefone', 'Custo', 'Ações'], event.suppliers.map((supplier) => [
      escapeHtml(supplier.name),
      escapeHtml(supplier.service || '-'),
      escapeHtml(supplier.phone || '-'),
      currency.format(Number(supplier.cost || 0)),
      rowActions('suppliers', supplier.id)
    ]))}
  `;
}

function renderTasks(event) {
  return `
    <form class="item-form" data-form="tasks">
      <input name="title" placeholder="Tarefa" required>
      <input name="responsible" placeholder="Responsável">
      <input name="dueDate" type="date">
      <label class="check-label"><input type="checkbox" name="done"> Concluída</label>
      <button>Adicionar</button>
    </form>
    ${table(['Tarefa', 'Responsável', 'Prazo', 'Status', 'Ações'], event.tasks.map((task) => [
      escapeHtml(task.title),
      escapeHtml(task.responsible || '-'),
      task.dueDate ? formatDate(task.dueDate) : '-',
      task.done ? 'Concluída' : 'Pendente',
      rowActions('tasks', task.id, task.done ? 'Marcar pendente' : 'Concluir')
    ]))}
  `;
}

function renderFinances(event) {
  return `
    <form class="item-form" data-form="finances">
      <input name="description" placeholder="Descrição" required>
      <select name="type"><option value="despesa">Despesa</option><option value="receita">Receita</option></select>
      <input name="amount" type="number" min="0" step="0.01" placeholder="Valor" required>
      <select name="status"><option>Pendente</option><option>Pago</option><option>Recebido</option></select>
      <button>Adicionar</button>
    </form>
    ${table(['Descrição', 'Tipo', 'Valor', 'Status', 'Ações'], event.finances.map((finance) => [
      escapeHtml(finance.description),
      finance.type === 'receita' ? 'Receita' : 'Despesa',
      currency.format(Number(finance.amount || 0)),
      escapeHtml(finance.status),
      rowActions('finances', finance.id)
    ]))}
  `;
}

function table(headers, rows) {
  if (!rows.length) return '<p class="event-meta">Nenhum item cadastrado nesta área.</p>';
  return `
    <div class="table-wrap">
      <table>
        <thead><tr>${headers.map((header) => `<th>${header}</th>`).join('')}</tr></thead>
        <tbody>
          ${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function rowActions(collection, id, toggleLabel = '') {
  const toggleButton = collection === 'tasks'
    ? `<button type="button" class="secondary" onclick="toggleTask('${id}')">${toggleLabel}</button>`
    : '';
  return `<div class="table-actions">${toggleButton}<button type="button" class="danger" onclick="deleteNested('${collection}', '${id}')">Excluir</button></div>`;
}

function participantActions(guest) {
  if (guest.status === 'Cancelado') {
    return `<div class="table-actions"><button type="button" class="danger" onclick="deleteNested('guests', '${guest.id}')">Remover</button></div>`;
  }
  return `<div class="table-actions"><button type="button" class="secondary" onclick="cancelRegistration('${guest.id}')">Cancelar inscrição</button></div>`;
}

function bindTabForms(event) {
  const form = document.querySelector('[data-form]');
  if (!form) return;
  const phoneInput = form.querySelector('input[name="phone"]');

  if (form.dataset.form === 'guests' && phoneInput) {
    phoneInput.addEventListener('input', () => {
      phoneInput.value = phoneInput.value.replace(/\D/g, '').slice(0, 11);
      phoneInput.setCustomValidity('');
    });
  }

  form.addEventListener('submit', async (submitEvent) => {
    submitEvent.preventDefault();
    const collection = form.dataset.form;
    const body = formDataToObject(form);
    if (body.done === 'on') body.done = true;

    if (collection === 'guests' && !isValidParticipantPhone(body.phone)) {
      phoneInput?.setCustomValidity(PHONE_ERROR_MESSAGE);
      phoneInput?.reportValidity();
      showTabMessage(PHONE_ERROR_MESSAGE, true);
      return;
    }

    phoneInput?.setCustomValidity('');

    try {
      await API.request(`/api/events/${event.id}/${collection}`, {
        method: 'POST',
        body
      });

      form.reset();
      await loadEvents();
      await loadNotifications();
      showTabMessage(collection === 'guests' ? 'Inscrição realizada com sucesso.' : 'Item adicionado com sucesso.');
    } catch (error) {
      showTabMessage(error.message, true);
    }
  });
}

function isValidParticipantPhone(phone) {
  return /^\d{10,11}$/.test(String(phone || ''));
}

function showTabMessage(text, isError = false) {
  const message = document.getElementById('tabMessage');
  if (!message) return;
  message.textContent = text;
  message.classList.add('show');
  message.classList.toggle('error', isError);
}

function fillEventForm(event = null) {
  document.getElementById('eventFormTitle').textContent = event ? 'Editar evento' : 'Cadastrar evento';
  document.getElementById('eventId').value = event?.id || '';
  document.getElementById('title').value = event?.title || '';
  document.getElementById('date').value = event?.date || '';
  document.getElementById('time').value = event?.time || '';
  document.getElementById('location').value = event?.location || '';
  document.getElementById('capacity').value = event?.capacity || '';
  document.getElementById('type').value = event?.type || 'Social';
  document.getElementById('status').value = event?.status || 'Planejamento';
  document.getElementById('budget').value = event?.budget || '';
  document.getElementById('description').value = event?.description || '';
}

window.selectEvent = function selectEvent(eventId) {
  selectedEventId = eventId;
  renderDetails();
};

window.editEvent = function editEvent(eventId) {
  const event = events.find((item) => item.id === eventId);
  if (!event) return;
  fillEventForm(event);
  document.getElementById('eventFormCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window.deleteEvent = async function deleteEvent(eventId) {
  if (!confirm('Deseja excluir este evento?')) return;
  await API.request(`/api/events/${eventId}`, { method: 'DELETE' });
  if (selectedEventId === eventId) selectedEventId = null;
  await loadEvents();
  await loadNotifications();
};

window.deleteNested = async function deleteNested(collection, itemId) {
  const event = getSelectedEvent();
  if (!event) return;
  await API.request(`/api/events/${event.id}/${collection}/${itemId}`, { method: 'DELETE' });
  await loadEvents();
  await loadNotifications();
};

window.cancelRegistration = async function cancelRegistration(itemId) {
  const event = getSelectedEvent();
  if (!event) return;

  const guest = event.guests.find((item) => item.id === itemId);
  if (!guest) return;

  if (!confirm('Deseja cancelar esta inscrição? A vaga voltará a ficar disponível.')) return;

  try {
    await API.request(`/api/events/${event.id}/guests/${itemId}`, {
      method: 'PUT',
      body: { ...guest, status: 'Cancelado' }
    });
    await loadEvents();
    await loadNotifications();
    showTabMessage('Inscrição cancelada com sucesso. A vaga foi liberada.');
  } catch (error) {
    showTabMessage(error.message, true);
  }
};

window.toggleTask = async function toggleTask(itemId) {
  const event = getSelectedEvent();
  if (!event) return;
  const task = event.tasks.find((item) => item.id === itemId);
  if (!task) return;
  await API.request(`/api/events/${event.id}/tasks/${itemId}`, {
    method: 'PUT',
    body: { ...task, done: !task.done }
  });
  await loadEvents();
  await loadNotifications();
};


window.markNotificationRead = async function markNotificationRead(notificationId) {
  try {
    await API.request(`/api/notifications/${notificationId}/read`, { method: 'PUT' });
    await loadNotifications();
  } catch (error) {
    showMessage('reportMessage', error.message, true);
  }
};

window.clearNotifications = async function clearNotifications() {
  try {
    await API.request('/api/notifications', { method: 'DELETE' });
    await loadNotifications();
  } catch (error) {
    showMessage('reportMessage', error.message, true);
  }
};

function formatDateTime(dateValue) {
  if (!dateValue) return '-';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return String(dateValue);
  return date.toLocaleString('pt-BR');
}

function formatDate(dateValue) {
  if (!dateValue) return '-';
  const [year, month, day] = dateValue.split('-');
  if (!year || !month || !day) return dateValue;
  return `${day}/${month}/${year}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

document.addEventListener('DOMContentLoaded', async () => {
  if (!protectPage()) return;

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    try {
      await API.request('/api/auth/logout', { method: 'POST' });
    } catch (_) {
      // Mesmo se a sessão já tiver expirado, limpamos o navegador.
    }
    API.token = null;
    API.user = null;
    location.href = 'index.html';
  });

  document.getElementById('newEventBtn').addEventListener('click', () => {
    fillEventForm();
    document.getElementById('eventFormCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  document.getElementById('reportPdfBtn').addEventListener('click', () => downloadReport('pdf'));
  document.getElementById('reportExcelBtn').addEventListener('click', () => downloadReport('excel'));

  document.getElementById('cancelEditBtn').addEventListener('click', () => {
    fillEventForm();
    showMessage('eventMessage', 'Formulário limpo.');
  });

  document.getElementById('eventForm').addEventListener('submit', async (submitEvent) => {
    submitEvent.preventDefault();
    const form = submitEvent.currentTarget;
    const body = formDataToObject(form);
    const eventId = body.id;
    delete body.id;

    try {
      if (eventId) {
        await API.request(`/api/events/${eventId}`, { method: 'PUT', body });
        showMessage('eventMessage', 'Evento atualizado com sucesso.');
      } else {
        const created = await API.request('/api/events', { method: 'POST', body });
        selectedEventId = created.id;
        showMessage('eventMessage', 'Evento cadastrado com sucesso.');
      }
      fillEventForm();
      await loadEvents();
      await loadNotifications();
    } catch (error) {
      showMessage('eventMessage', error.message, true);
    }
  });

  try {
    await loadMe();
    await loadEvents();
    await loadNotifications();
  } catch (error) {
    showMessage('eventMessage', error.message, true);
  }
});
