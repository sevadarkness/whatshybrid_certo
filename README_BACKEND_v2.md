# Backend WhatsHybrid CRM & AI Suite v2

## Requisitos

- Node.js >= 18
- SQLite (via arquivo local `data.db`)
- Conta e chave de API da OpenAI

## Passos de setup

1. Copie `.env.example` para `.env` e preencha:
   - `OPENAI_API_KEY`
   - `EXTENSION_SHARED_KEY` (a mesma que você vai colocar nas opções da extensão)
2. Instale dependências:

   ```bash
   npm install
   ```

3. Rode as migrações do Prisma:

   ```bash
   npx prisma migrate dev --name init
   ```

4. Inicie o servidor:

   ```bash
   npm run dev
   ```

5. Configure a URL do backend nas opções da extensão (ex: `http://localhost:4000`).

## Endpoints principais

- `POST /ai/reply` – gera sugestão de resposta com IA.
- `GET /crm/deals` – lista negócios.
- `GET /crm/deals/by-external/:externalId` – busca negócio pelo identificador do chat.
- `POST /crm/deals` – cria/atualiza negócio (upsert por `externalId`).
- `PATCH /crm/deals/:id` – atualiza estágio/notas/etc.
- `POST /campaigns` – cria campanha em massa com intervalos, lote e perfil.
- `GET /campaigns` – lista campanhas e itens.
- `GET /flows` / `PUT /flows` – leitura e gravação de flows de automação.
- `POST /events/message` – recebe eventos de mensagens para rastreamento em tempo real.
- `GET /tasks` / `POST /tasks` – tarefas de follow-up.
- `GET /tasks/due-soon` – tarefas prestes a vencer (usado pelo background para notificações).
- `GET /users` / `POST /users` – gestão simples de usuários (multioperador).


## Envio real de campanhas via WhatsApp Business Cloud API

Esta versão inclui um worker de campanhas que usa a API oficial do WhatsApp Business (Cloud API).

- Configure no `.env`:
  - `WHATSAPP_API_BASE_URL` (normalmente `https://graph.facebook.com/v19.0`)
  - `WHATSAPP_BUSINESS_PHONE_ID` (ID do número de WhatsApp Business)
  - `WHATSAPP_ACCESS_TOKEN` (token de acesso gerado no Facebook Developer)
- Ao criar campanhas pela extensão (`bulk.html`), elas serão salvas no banco.
- O `CampaignWorker` (iniciado em `src/index.js`) irá:
  - Identificar campanhas pendentes com agendamento já válido.
  - Enviar mensagens em lote respeitando `intervalSeconds` e `batchSize`.
  - Atualizar o status de cada item (`PENDING` → `SENT` ou `ERROR`).
  - Marcar campanhas como `COMPLETED` quando não houver mais itens pendentes.


## ✅ Upgrade (Hybrid Bulk v1)

Este ZIP foi atualizado para que o **envio em massa via Backend/API** suporte também **anexos (mídia)**, com upload para a WhatsApp Cloud API e envio por `media id`.

### O que mudou
- `Campaign.media` (JSON) agora é persistido no banco e **mídias são enviadas** no worker.
- `CampaignItem` ganhou `retries` e `lastAttemptAt` para tentativas e auditoria.
- O backend aceita payloads maiores (`JSON_LIMIT`, padrão `50mb`) para anexos em base64.

### Variáveis de ambiente novas (opcionais)
- `JSON_LIMIT=50mb`
- `CAMPAIGN_MAX_RETRIES=3`
- `CAMPAIGN_DELAY_JITTER=0.25` (25% de jitter no intervalo)
- `CAMPAIGN_TICK_INTERVAL_MS=15000`

### Prisma / Banco
Após atualizar, rode:
- `npx prisma migrate dev --name bulk_hybrid_media_retry`
- `npx prisma generate`

> Observação: se você estiver em ambiente de teste, pode simplesmente apagar o arquivo `data.db` (caso exista) e rodar o migrate.

