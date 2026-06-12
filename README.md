# KONECT - Sistema de Controle de Eventos

Versão funcional do projeto com backend em Node.js/Express e frontend em HTML, CSS e JavaScript.

## O que foi implementado

- Tema visual em tons roxos/púrpuras aplicado ao sistema.

- Cadastro de usuário
- Login com sessão por token
- Logout
- Recuperação de senha demonstrativa usando o código `123456`
- Cadastro, edição, listagem e exclusão de eventos
- Controle de convidados por evento
- Controle de fornecedores por evento
- Checklist de tarefas por evento
- Controle financeiro por evento
- Painel com resumo automático
- Persistência dos dados em `data/db.json`

## Como rodar

1. Abra a pasta do projeto no VS Code.
2. Instale as dependências:

```bash
npm install
```

3. Inicie o servidor:

```bash
npm start
```

4. Acesse no navegador:

```text
http://localhost:3000
```

## Estrutura principal

```text
server.js              Backend e rotas da API
data/db.json           Arquivo onde os dados ficam salvos
public/index.html      Tela de login
public/cadastro.html   Tela de cadastro
public/recsenha.html   Tela de recuperação
public/home.html       Painel principal
public/js/api.js       Funções de requisição ao backend
public/js/auth.js      Login, cadastro e recuperação
public/js/dashboard.js Painel de eventos
public/css/styles.css  Estilos do sistema
```

## Rotas principais da API

### Autenticação

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/recover`
- `GET /api/me`

### Eventos

- `GET /api/events`
- `POST /api/events`
- `GET /api/events/:eventId`
- `PUT /api/events/:eventId`
- `DELETE /api/events/:eventId`

### Itens do evento

- `POST /api/events/:eventId/guests`
- `POST /api/events/:eventId/suppliers`
- `POST /api/events/:eventId/tasks`
- `POST /api/events/:eventId/finances`
- Também há `PUT` e `DELETE` para cada item usando `/:itemId`.

## Observação

A recuperação de senha está demonstrativa, porque envio real por e-mail exige configurar serviço externo como Gmail SMTP, SendGrid ou Mailtrap. Para fins acadêmicos, o sistema valida o código `123456`.

## Sprint 1 implementada

Esta versão atende aos cards da Sprint 1:

- US01 - Cadastro e login de usuários
- US02 - Criação e edição de eventos
- US03 - Definição de data, local e capacidade
- US10 - Autenticação segura

### O que foi implementado

- Tema visual em tons roxos/púrpuras aplicado ao sistema.

- Cadastro de usuário com validação de campos.
- Login com e-mail e senha.
- Senha armazenada com hash e salt, sem salvar senha em texto puro.
- Proteção das rotas internas por sessão/token.
- Criação de eventos.
- Edição de eventos.
- Definição de data, horário, local e capacidade máxima.
- Validação para impedir evento sem capacidade válida.
- Exibição da capacidade e vagas livres no painel.
- Correção de erro de JavaScript no painel.

### Como rodar

```bash
npm install
npm start
```

Depois acesse:

```text
http://localhost:3000
```


## Sprint 2 implementada

Esta versão atende aos cards da Sprint 2:

- US04 - Inscrição de participantes
- US05 - Controle de vagas disponíveis
- US06 - Listagem de participantes por evento
- US07 - Cancelamento de inscrição

### O que foi implementado/refinado

- Formulário de inscrição de participantes dentro de cada evento.
- Bloqueio de inscrição quando o evento atinge a capacidade máxima.
- Impedimento de inscrição duplicada pelo mesmo e-mail no mesmo evento.
- Exibição de participantes inscritos por evento.
- Cancelamento de inscrição sem apagar o histórico.
- Liberação automática da vaga após o cancelamento.
- Separação visual entre participantes inscritos e inscrições canceladas.
- Mensagens de erro e sucesso para inscrições, lotação e duplicidade.

### Como testar a Sprint 2

1. Cadastre um usuário e faça login.
2. Crie um evento com capacidade baixa, por exemplo, 2 vagas.
3. Abra o evento e inscreva dois participantes.
4. Tente inscrever um terceiro participante para verificar o bloqueio por lotação.
5. Cancele uma inscrição.
6. Verifique se a vaga voltou a ficar disponível.
7. Inscreva outro participante para confirmar que o controle de vagas está funcionando.

## Sprint 3 implementada

Esta versão atende aos cards da Sprint 3:

- US08 - Relatório de eventos em PDF e Excel
- US09 - Interface responsiva
- US11 - Interface simples e intuitiva
- US12 - Notificações por e-mail ou sistema

### O que foi implementado/refinado

- Botão para gerar relatório de eventos em PDF.
- Botão para gerar relatório de eventos em Excel no formato `.xls` compatível com Excel.
- Relatórios com dados de evento, data, local, status, capacidade, inscritos, vagas livres e orçamento.
- Painel de notificações dentro do sistema.
- Notificações ao criar evento, editar evento, inscrever participante, cancelar inscrição e gerar relatório.
- Opção para marcar notificação como lida.
- Refinamento visual do painel principal.
- Ajustes de responsividade para celular, tablet e computador.
- Melhor organização dos botões e tabelas em telas pequenas.

### Como testar a Sprint 3

1. Faça login no sistema.
2. Crie ou edite um evento para gerar notificações.
3. Inscreva e cancele participantes para testar notificações e controle de vagas.
4. Clique em **Baixar PDF** para gerar o relatório em PDF.
5. Clique em **Baixar Excel** para gerar o relatório em Excel.
6. Reduza a largura do navegador ou abra pelo celular para verificar a responsividade.
7. Marque uma notificação como lida no painel.
