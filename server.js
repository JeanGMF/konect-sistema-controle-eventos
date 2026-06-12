const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'data', 'db.json');
const PUBLIC_PATH = path.join(__dirname, 'public');

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(PUBLIC_PATH));

function readDB() {
  if (!fs.existsSync(DB_PATH)) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify({ users: [], sessions: [], events: [], notifications: [] }, null, 2));
  }

  const content = fs.readFileSync(DB_PATH, 'utf-8');
  return normalizeDB(JSON.parse(content || '{"users":[],"sessions":[],"events":[],"notifications":[]}'));
}

function writeDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function normalizeDB(db) {
  db.users = Array.isArray(db.users) ? db.users : [];
  db.sessions = Array.isArray(db.sessions) ? db.sessions : [];
  db.events = Array.isArray(db.events) ? db.events : [];
  db.notifications = Array.isArray(db.notifications) ? db.notifications : [];

  db.notifications = db.notifications.map((notification) => ({
    id: notification.id || createId('notification'),
    userId: notification.userId || '',
    title: notification.title || 'Notificação',
    message: notification.message || '',
    type: notification.type || 'sistema',
    read: Boolean(notification.read),
    createdAt: notification.createdAt || new Date().toISOString()
  }));

  db.events = db.events.map((event) => ({
    ...event,
    guests: Array.isArray(event.guests) ? event.guests : [],
    suppliers: Array.isArray(event.suppliers) ? event.suppliers : [],
    tasks: Array.isArray(event.tasks) ? event.tasks : [],
    finances: Array.isArray(event.finances) ? event.finances : [],
    capacity: Number.isInteger(Number(event.capacity)) && Number(event.capacity) > 0 ? Number(event.capacity) : 1
  }));

  return db;
}

function normalizeEmail(email = '') {
  return String(email).trim().toLowerCase();
}

function required(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email));
}

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(String(password), salt, 120000, 64, 'sha512').toString('hex');
  return { salt, hash };
}

function verifyPassword(password, user) {
  const { hash } = hashPassword(password, user.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(user.passwordHash, 'hex'));
}

function publicUser(user) {
  return {
    id: user.id,
    nome: user.nome,
    sobrenome: user.sobrenome,
    email: user.email,
    cpf: user.cpf,
    createdAt: user.createdAt
  };
}

function cleanExpiredSessions(db) {
  const now = Date.now();
  db.sessions = db.sessions.filter((session) => new Date(session.expiresAt).getTime() > now);
}

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.replace('Bearer ', '').trim() : '';

  if (!token) {
    return res.status(401).json({ message: 'Você precisa fazer login.' });
  }

  const db = readDB();
  cleanExpiredSessions(db);
  writeDB(db);

  const session = db.sessions.find((item) => item.token === token);
  if (!session) {
    return res.status(401).json({ message: 'Sessão expirada. Faça login novamente.' });
  }

  const user = db.users.find((item) => item.id === session.userId);
  if (!user) {
    return res.status(401).json({ message: 'Usuário não encontrado.' });
  }

  req.user = user;
  next();
}

function eventForResponse(event) {
  const guests = Array.isArray(event.guests) ? event.guests : [];
  const suppliers = Array.isArray(event.suppliers) ? event.suppliers : [];
  const tasks = Array.isArray(event.tasks) ? event.tasks : [];
  const finances = Array.isArray(event.finances) ? event.finances : [];
  const capacity = Number(event.capacity || 1);

  const expenses = finances
    .filter((item) => item.type === 'despesa')
    .reduce((total, item) => total + Number(item.amount || 0), 0);
  const revenue = finances
    .filter((item) => item.type === 'receita')
    .reduce((total, item) => total + Number(item.amount || 0), 0);
  const confirmedGuests = guests.filter((item) => item.status === 'Confirmado').length;
  const activeParticipants = guests.filter((item) => item.status !== 'Cancelado').length;
  const doneTasks = tasks.filter((item) => item.done).length;
  const availableSlots = Math.max(capacity - activeParticipants, 0);

  return {
    ...event,
    capacity,
    guests,
    suppliers,
    tasks,
    finances,
    summary: {
      totalGuests: guests.length,
      totalParticipants: activeParticipants,
      confirmedGuests,
      totalSuppliers: suppliers.length,
      totalTasks: tasks.length,
      doneTasks,
      budget: Number(event.budget || 0),
      capacity,
      availableSlots,
      isFull: capacity > 0 && availableSlots === 0,
      expenses,
      revenue,
      balance: revenue - expenses
    }
  };
}

function findUserEvent(db, userId, eventId) {
  return db.events.find((event) => event.id === eventId && event.userId === userId);
}


function addNotification(db, userId, title, message, type = 'sistema') {
  db.notifications.unshift({
    id: createId('notification'),
    userId,
    title,
    message,
    type,
    read: false,
    createdAt: new Date().toISOString()
  });

  db.notifications = db.notifications.slice(0, 100);
}

function getUserEventsForReport(db, userId) {
  return db.events
    .filter((event) => event.userId === userId)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map(eventForResponse);
}

function xml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function pdfSafe(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function formatReportDate(dateValue) {
  if (!dateValue) return '-';
  const [year, month, day] = String(dateValue).split('-');
  if (!year || !month || !day) return String(dateValue);
  return `${day}/${month}/${year}`;
}

function buildExcelReport(events, user) {
  const rows = events.map((event) => {
    const activeParticipants = event.guests.filter((guest) => guest.status !== 'Cancelado').length;
    const canceledParticipants = event.guests.filter((guest) => guest.status === 'Cancelado').length;
    return [
      event.title,
      formatReportDate(event.date),
      event.time || '-',
      event.location,
      event.type,
      event.status,
      event.summary.capacity,
      activeParticipants,
      event.summary.availableSlots,
      canceledParticipants,
      Number(event.budget || 0),
      event.description || '-'
    ];
  });

  const headers = ['Evento', 'Data', 'Horário', 'Local', 'Tipo', 'Status', 'Capacidade', 'Inscritos', 'Vagas livres', 'Cancelamentos', 'Orçamento', 'Descrição'];
  const worksheetRows = [headers, ...rows].map((row) => `
    <Row>${row.map((cell) => `<Cell><Data ss:Type="${typeof cell === 'number' ? 'Number' : 'String'}">${xml(cell)}</Data></Cell>`).join('')}</Row>`).join('');

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
  <Author>KONECT</Author>
  <Title>Relatório de Eventos</Title>
 </DocumentProperties>
 <Worksheet ss:Name="Eventos">
  <Table>
   <Row><Cell ss:MergeAcross="11"><Data ss:Type="String">Relatório de Eventos - KONECT</Data></Cell></Row>
   <Row><Cell ss:MergeAcross="11"><Data ss:Type="String">Gerado por: ${xml(user.nome)} ${xml(user.sobrenome)} - ${new Date().toLocaleString('pt-BR')}</Data></Cell></Row>
   <Row></Row>
   ${worksheetRows}
  </Table>
 </Worksheet>
</Workbook>`;
}

function chunkLines(lines, maxPerPage = 38) {
  const pages = [];
  for (let index = 0; index < lines.length; index += maxPerPage) {
    pages.push(lines.slice(index, index + maxPerPage));
  }
  return pages.length ? pages : [[]];
}

function buildPdfReport(events, user) {
  const lines = [
    'KONECT - Relatorio de Eventos',
    `Gerado por: ${user.nome} ${user.sobrenome}`,
    `Data de emissao: ${new Date().toLocaleString('pt-BR')}`,
    '',
    `Total de eventos: ${events.length}`,
    `Total de participantes ativos: ${events.reduce((total, event) => total + event.summary.totalParticipants, 0)}`,
    ''
  ];

  if (!events.length) {
    lines.push('Nenhum evento cadastrado.');
  }

  events.forEach((event, index) => {
    lines.push(`${index + 1}. ${event.title}`);
    lines.push(`Data: ${formatReportDate(event.date)} ${event.time || ''} | Local: ${event.location}`);
    lines.push(`Capacidade: ${event.summary.capacity} | Inscritos: ${event.summary.totalParticipants} | Vagas livres: ${event.summary.availableSlots}`);
    lines.push(`Status: ${event.status} | Tipo: ${event.type} | Orcamento: R$ ${Number(event.budget || 0).toFixed(2)}`);
    if (event.description) lines.push(`Descricao: ${event.description}`);
    lines.push('');
  });

  const pageLines = chunkLines(lines);
  const objects = [];
  const fontObjNum = 3 + (pageLines.length * 2);
  const pageObjNums = [];

  objects[0] = '<< /Type /Catalog /Pages 2 0 R >>';

  pageLines.forEach((page, index) => {
    const pageObjNum = 3 + index * 2;
    const contentObjNum = pageObjNum + 1;
    pageObjNums.push(pageObjNum);

    const text = [
      'BT',
      '/F1 12 Tf',
      '50 790 Td',
      '14 TL',
      ...page.map((line, lineIndex) => `${lineIndex === 0 ? '' : 'T* ' }(${pdfSafe(line).slice(0, 105)}) Tj`),
      'ET'
    ].join('\n');

    objects[pageObjNum - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 ${fontObjNum} 0 R >> >> /Contents ${contentObjNum} 0 R >>`;
    objects[contentObjNum - 1] = `<< /Length ${Buffer.byteLength(text, 'utf8')} >>\nstream\n${text}\nendstream`;
  });

  objects[1] = `<< /Type /Pages /Kids [${pageObjNums.map((num) => `${num} 0 R`).join(' ')}] /Count ${pageLines.length} >>`;
  objects[fontObjNum - 1] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((objectContent, index) => {
    offsets[index + 1] = Buffer.byteLength(pdf, 'utf8');
    pdf += `${index + 1} 0 obj\n${objectContent}\nendobj\n`;
  });

  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let index = 1; index <= objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
}

function validateEventPayload(body) {
  if (!required(body.title)) return 'Informe o nome do evento.';
  if (!required(body.date)) return 'Informe a data do evento.';
  if (!required(body.location)) return 'Informe o local do evento.';
  if (!required(body.capacity)) return 'Informe a capacidade máxima de participantes.';

  const capacity = Number(body.capacity);
  if (!Number.isInteger(capacity) || capacity < 1) {
    return 'A capacidade deve ser um número inteiro maior que zero.';
  }

  return null;
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'KONECT' });
});

app.post('/api/auth/register', (req, res) => {
  const { nome, sobrenome, email, cpf, senha, confirmarSenha } = req.body;
  const cleanEmail = normalizeEmail(email);

  if (![nome, sobrenome, cleanEmail, cpf, senha, confirmarSenha].every(required)) {
    return res.status(400).json({ message: 'Preencha todos os campos.' });
  }

  if (!isValidEmail(cleanEmail)) {
    return res.status(400).json({ message: 'Informe um e-mail válido.' });
  }

  if (String(senha).length < 6) {
    return res.status(400).json({ message: 'A senha precisa ter pelo menos 6 caracteres.' });
  }

  if (senha !== confirmarSenha) {
    return res.status(400).json({ message: 'As senhas não conferem.' });
  }

  const db = readDB();
  const userExists = db.users.some((user) => user.email === cleanEmail || user.cpf === String(cpf).trim());
  if (userExists) {
    return res.status(409).json({ message: 'E-mail ou CPF já cadastrado.' });
  }

  const { salt, hash } = hashPassword(senha);
  const user = {
    id: createId('user'),
    nome: String(nome).trim(),
    sobrenome: String(sobrenome).trim(),
    email: cleanEmail,
    cpf: String(cpf).trim(),
    salt,
    passwordHash: hash,
    createdAt: new Date().toISOString()
  };

  db.users.push(user);
  writeDB(db);

  res.status(201).json({ message: 'Conta criada com sucesso.', user: publicUser(user) });
});

app.post('/api/auth/login', (req, res) => {
  const email = normalizeEmail(req.body.email || req.body.usuario || req.body.user);
  const password = req.body.password || req.body.senha;

  if (!required(email) || !required(password)) {
    return res.status(400).json({ message: 'Informe e-mail e senha.' });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ message: 'Informe um e-mail válido.' });
  }

  const db = readDB();
  const user = db.users.find((item) => item.email === email);
  if (!user || !verifyPassword(password, user)) {
    return res.status(401).json({ message: 'E-mail ou senha inválidos.' });
  }

  cleanExpiredSessions(db);
  const token = crypto.randomBytes(48).toString('hex');
  db.sessions.push({
    token,
    userId: user.id,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 8).toISOString()
  });
  writeDB(db);

  res.json({ message: 'Login realizado com sucesso.', token, user: publicUser(user) });
});

app.post('/api/auth/logout', auth, (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.replace('Bearer ', '').trim();
  const db = readDB();
  db.sessions = db.sessions.filter((session) => session.token !== token);
  writeDB(db);
  res.json({ message: 'Logout realizado.' });
});

app.post('/api/auth/recover', (req, res) => {
  const email = normalizeEmail(req.body.email);
  const confirmEmail = normalizeEmail(req.body.confirmEmail);
  const code = String(req.body.code || '').trim();

  if (!required(email) || !required(confirmEmail)) {
    return res.status(400).json({ message: 'Informe e confirme o e-mail.' });
  }

  if (email !== confirmEmail) {
    return res.status(400).json({ message: 'Os e-mails não conferem.' });
  }

  const db = readDB();
  const user = db.users.find((item) => item.email === email);
  if (!user) {
    return res.status(404).json({ message: 'E-mail não encontrado.' });
  }

  if (code && code !== '123456') {
    return res.status(400).json({ message: 'Código inválido. Para teste, use 123456.' });
  }

  res.json({ message: 'Código validado. Em um sistema real, o link de redefinição seria enviado por e-mail. Para teste, use o código 123456.' });
});

app.get('/api/me', auth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.get('/api/events', auth, (req, res) => {
  const db = readDB();
  const events = db.events
    .filter((event) => event.userId === req.user.id)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map(eventForResponse);
  res.json(events);
});

app.post('/api/events', auth, (req, res) => {
  const error = validateEventPayload(req.body);
  if (error) return res.status(400).json({ message: error });

  const db = readDB();
  const event = {
    id: createId('event'),
    userId: req.user.id,
    title: String(req.body.title).trim(),
    date: req.body.date,
    time: req.body.time || '',
    location: String(req.body.location).trim(),
    capacity: Number(req.body.capacity),
    type: req.body.type || 'Social',
    status: req.body.status || 'Planejamento',
    budget: Number(req.body.budget || 0),
    description: req.body.description || '',
    guests: [],
    suppliers: [],
    tasks: [],
    finances: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  db.events.push(event);
  addNotification(db, req.user.id, 'Evento criado', `O evento ${event.title} foi cadastrado com sucesso.`, 'evento');
  writeDB(db);
  res.status(201).json(eventForResponse(event));
});

app.get('/api/events/:eventId', auth, (req, res) => {
  const db = readDB();
  const event = findUserEvent(db, req.user.id, req.params.eventId);
  if (!event) return res.status(404).json({ message: 'Evento não encontrado.' });
  res.json(eventForResponse(event));
});

app.put('/api/events/:eventId', auth, (req, res) => {
  const error = validateEventPayload(req.body);
  if (error) return res.status(400).json({ message: error });

  const db = readDB();
  const event = findUserEvent(db, req.user.id, req.params.eventId);
  if (!event) return res.status(404).json({ message: 'Evento não encontrado.' });

  Object.assign(event, {
    title: String(req.body.title).trim(),
    date: req.body.date,
    time: req.body.time || '',
    location: String(req.body.location).trim(),
    capacity: Number(req.body.capacity),
    type: req.body.type || 'Social',
    status: req.body.status || 'Planejamento',
    budget: Number(req.body.budget || 0),
    description: req.body.description || '',
    updatedAt: new Date().toISOString()
  });

  addNotification(db, req.user.id, 'Evento atualizado', `O evento ${event.title} foi atualizado com sucesso.`, 'evento');
  writeDB(db);
  res.json(eventForResponse(event));
});

app.delete('/api/events/:eventId', auth, (req, res) => {
  const db = readDB();
  const before = db.events.length;
  db.events = db.events.filter((event) => !(event.id === req.params.eventId && event.userId === req.user.id));

  if (db.events.length === before) {
    return res.status(404).json({ message: 'Evento não encontrado.' });
  }

  addNotification(db, req.user.id, 'Evento excluído', 'Um evento foi removido do sistema.', 'evento');
  writeDB(db);
  res.json({ message: 'Evento excluído.' });
});

function nestedRoute(collectionName, createItem) {
  app.post(`/api/events/:eventId/${collectionName}`, auth, (req, res) => {
    const db = readDB();
    const event = findUserEvent(db, req.user.id, req.params.eventId);
    if (!event) return res.status(404).json({ message: 'Evento não encontrado.' });

    if (collectionName === 'guests') {
      if (!required(req.body.name)) {
        return res.status(400).json({ message: 'Informe o nome do participante.' });
      }

      const capacity = Number(event.capacity || 1);
      const activeParticipants = event.guests.filter((guest) => guest.status !== 'Cancelado').length;
      if (activeParticipants >= capacity) {
        return res.status(400).json({ message: 'Não há vagas disponíveis para este evento.' });
      }

      const email = normalizeEmail(req.body.email || '');
      const duplicate = email && event.guests.some((guest) => guest.status !== 'Cancelado' && normalizeEmail(guest.email || '') === email);
      if (duplicate) {
        return res.status(409).json({ message: 'Este participante já está inscrito neste evento.' });
      }
    }

    const item = createItem(req.body);
    event[collectionName].push(item);
    event.updatedAt = new Date().toISOString();
    if (collectionName === 'guests') {
      addNotification(db, req.user.id, 'Inscrição realizada', `${item.name} foi inscrito no evento ${event.title}.`, 'inscricao');
    } else if (collectionName === 'tasks') {
      addNotification(db, req.user.id, 'Tarefa adicionada', `Nova tarefa adicionada ao evento ${event.title}.`, 'sistema');
    }
    writeDB(db);
    res.status(201).json(eventForResponse(event));
  });

  app.put(`/api/events/:eventId/${collectionName}/:itemId`, auth, (req, res) => {
    const db = readDB();
    const event = findUserEvent(db, req.user.id, req.params.eventId);
    if (!event) return res.status(404).json({ message: 'Evento não encontrado.' });

    const itemIndex = event[collectionName].findIndex((item) => item.id === req.params.itemId);
    if (itemIndex === -1) return res.status(404).json({ message: 'Item não encontrado.' });

    if (collectionName === 'guests') {
      const currentGuest = event[collectionName][itemIndex];
      const nextStatus = req.body.status || currentGuest.status || 'Confirmado';
      const willBeActive = nextStatus !== 'Cancelado';
      const capacity = Number(event.capacity || 1);
      const activeParticipants = event.guests.filter((guest) => guest.id !== currentGuest.id && guest.status !== 'Cancelado').length;

      if (willBeActive && activeParticipants >= capacity) {
        return res.status(400).json({ message: 'Não há vagas disponíveis para reativar esta inscrição.' });
      }

      const email = normalizeEmail(req.body.email || currentGuest.email || '');
      const duplicate = email && event.guests.some((guest) => guest.id !== currentGuest.id && guest.status !== 'Cancelado' && normalizeEmail(guest.email || '') === email);
      if (willBeActive && duplicate) {
        return res.status(409).json({ message: 'Este participante já está inscrito neste evento.' });
      }
    }

    const previousItem = event[collectionName][itemIndex];
    event[collectionName][itemIndex] = { ...previousItem, ...createItem(req.body, previousItem.id) };
    event.updatedAt = new Date().toISOString();
    if (collectionName === 'guests' && previousItem.status !== 'Cancelado' && event[collectionName][itemIndex].status === 'Cancelado') {
      addNotification(db, req.user.id, 'Inscrição cancelada', `${event[collectionName][itemIndex].name} teve a inscrição cancelada no evento ${event.title}. A vaga voltou a ficar disponível.`, 'inscricao');
    }
    writeDB(db);
    res.json(eventForResponse(event));
  });

  app.delete(`/api/events/:eventId/${collectionName}/:itemId`, auth, (req, res) => {
    const db = readDB();
    const event = findUserEvent(db, req.user.id, req.params.eventId);
    if (!event) return res.status(404).json({ message: 'Evento não encontrado.' });

    const before = event[collectionName].length;
    event[collectionName] = event[collectionName].filter((item) => item.id !== req.params.itemId);
    if (before === event[collectionName].length) return res.status(404).json({ message: 'Item não encontrado.' });

    event.updatedAt = new Date().toISOString();
    writeDB(db);
    res.json(eventForResponse(event));
  });
}

nestedRoute('guests', (body, id = createId('guest')) => ({
  id,
  name: String(body.name || 'Participante sem nome').trim(),
  email: normalizeEmail(body.email || ''),
  phone: String(body.phone || '').trim(),
  status: body.status || 'Confirmado',
  checkedIn: Boolean(body.checkedIn),
  cancelledAt: body.status === 'Cancelado' ? new Date().toISOString() : body.cancelledAt || null,
  updatedAt: new Date().toISOString()
}));

nestedRoute('suppliers', (body, id = createId('supplier')) => ({
  id,
  name: body.name || 'Fornecedor sem nome',
  service: body.service || '',
  phone: body.phone || '',
  cost: Number(body.cost || 0),
  status: body.status || 'Orçado'
}));

nestedRoute('tasks', (body, id = createId('task')) => ({
  id,
  title: body.title || 'Nova tarefa',
  responsible: body.responsible || '',
  dueDate: body.dueDate || '',
  done: Boolean(body.done)
}));

nestedRoute('finances', (body, id = createId('finance')) => ({
  id,
  description: body.description || 'Lançamento',
  type: body.type === 'receita' ? 'receita' : 'despesa',
  amount: Number(body.amount || 0),
  status: body.status || 'Pendente',
  dueDate: body.dueDate || ''
}));


app.get('/api/notifications', auth, (req, res) => {
  const db = readDB();
  const notifications = db.notifications
    .filter((notification) => notification.userId === req.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 20);
  res.json({ notifications, unread: notifications.filter((notification) => !notification.read).length });
});

app.put('/api/notifications/:notificationId/read', auth, (req, res) => {
  const db = readDB();
  const notification = db.notifications.find((item) => item.id === req.params.notificationId && item.userId === req.user.id);
  if (!notification) return res.status(404).json({ message: 'Notificação não encontrada.' });
  notification.read = true;
  writeDB(db);
  res.json({ message: 'Notificação marcada como lida.' });
});

app.get('/api/reports/events/excel', auth, (req, res) => {
  const db = readDB();
  const events = getUserEventsForReport(db, req.user.id);
  const report = buildExcelReport(events, req.user);
  addNotification(db, req.user.id, 'Relatório gerado', 'O relatório de eventos em Excel foi gerado.', 'relatorio');
  writeDB(db);
  res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="KONECT_relatorio_eventos.xls"');
  res.send(report);
});

app.get('/api/reports/events/pdf', auth, (req, res) => {
  const db = readDB();
  const events = getUserEventsForReport(db, req.user.id);
  const report = buildPdfReport(events, req.user);
  addNotification(db, req.user.id, 'Relatório gerado', 'O relatório de eventos em PDF foi gerado.', 'relatorio');
  writeDB(db);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="KONECT_relatorio_eventos.pdf"');
  res.send(report);
});

app.get('*', (req, res) => {
  res.sendFile(path.join(PUBLIC_PATH, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`KONECT rodando em http://localhost:${PORT}`);
});
