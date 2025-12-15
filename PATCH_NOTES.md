# Patch Notes (Correções aplicadas)

Este ZIP foi analisado e corrigido em pontos que podiam causar falhas, travamentos (unhandled rejections), inconsistência de créditos de IA e funcionalidades do painel que não enviavam mensagens.

## Backend

- **PrismaClient singleton**: removidos múltiplos `new PrismaClient()` espalhados em routes/services e substituído por um singleton (`backend/src/prisma.js`).
  - Evita múltiplas instâncias, problemas de conexão e warnings em runtime.

- **Rotas GET com proteção contra crash**: endpoints que faziam `await` sem `try/catch` foram ajustados para retornar **500** em erro, evitando **unhandled promise rejection**.

- **Créditos de IA (race condition / negativos)**:
  - O consumo de créditos agora é **atômico** via `updateMany` com condição `aiCredits >= custo`.
  - Adicionada checagem de expiração de trial (`trialEndsAt`) também nas rotas de IA.
  - Implementado **rollback** (reembolso) de créditos em caso de falha na chamada de IA.

- **Modelos OpenAI configuráveis + fallback**:
  - Modelos agora podem ser definidos via env (`OPENAI_MODEL_*`).
  - Caso o modelo configurado falhe (por indisponibilidade/conta sem acesso), é tentado `OPENAI_MODEL_FALLBACK`.

- **CampaignWorker**:
  - Evita sobreposição de ticks (quando o processamento dura mais do que 15s), o que podia gerar duplicidade/race em envio.

- **Campanhas com anexos (mídia) corrigidas**:
  - O campo `Campaign.media` é armazenado como **String (JSON)** no Prisma. O worker estava tratando como array/JSON e fazia `update(..., { media: out })`, o que quebrava ou impedia anexos.
  - Agora o worker **parseia JSON**, processa os uploads e **persiste `media` como JSON.stringify(...)**.
  - Também foi corrigido o filtro de campanhas no tick (condição `status` + `scheduleAt`), que antes podia ser sobrescrita por OR duplicado.
  - Itens que ficavam presos em `SENDING` após reinício/crash são automaticamente reprocessados após um timeout (env `CAMPAIGN_STALE_SENDING_MS`).

- **Dockerfile (Deploy) mais consistente com Prisma**:
  - O build agora copia `prisma/schema.prisma` antes do `npm install` e executa `npx prisma generate`, evitando erros de Prisma Client não gerado.

## Extensão

- **WhatsHybridBridge.sendMessage / sendMedia corrigidos**:
  - Antes: usavam `sendToContentScript({action:'sendMessage'})`, mas não havia handler no content-script, então **o envio falhava**.
  - Agora: o envio passa pelo pipeline correto **background -> wweb_content.js -> inject.js** usando `execute_script`.
  - Inclui resolução de destinatário:
    - aceita `chatId` (`5511...@c.us`),
    - aceita número (normaliza para `@c.us`),
    - aceita nome (tenta buscar nos contatos quando conectado).

- **Background (execute_script) mais resiliente**:
  - `executeScript` agora garante que existe uma aba do WhatsApp (o service worker pode acordar sem inicialização completa).
  - `checkWhatsAppTab` agora `await` na criação da aba e não chama mais `checkConnection` internamente (evita efeitos colaterais/recursão).

- **Bridge/Ping corrigido (conexão do painel)**:
  - `WhatsHybridBridge.connect()` e `popup.js` faziam `action: 'ping'` sem `target`.
  - Como `extractor_content.js` filtra mensagens por `target: 'extractor_content'`, o ping nunca respondia e o painel ficava *desconectado*.
  - Corrigido para enviar `target: 'extractor_content'` e adicionado fallback no `extractor_content.js` para aceitar ping sem target.

- **Botão "Abrir Kanban" (CRM injetado) não funcionava**:
  - O `content_main.js` enviava `{ type: 'OPEN_KANBAN_PAGE' }`, porém não existia handler no background.
  - Adicionado handler que abre (ou foca) `dashboard.html`.

- **Background: compatibilidade com sendMessage Promise/Callback**:
  - Evitado uso de `chrome.runtime.sendMessage(...).catch(...)` diretamente (poderia quebrar em ambientes onde `sendMessage` não retorna Promise).


## Fixes adicionais (Panel/Workspace + CRM API)

- **Painel (panel.html / workspace) travando por loop infinito**:
  - O `Workspace` assinava `StateManager.subscribe('connection.status', ...)` e, ao atualizar a UI, chamava novamente `StateManager.setConnectionStatus(...)`, causando **recursão infinita / stack overflow**.
  - Corrigido: `updateConnectionStatus()` agora atualiza **apenas a UI** e o estado é alterado somente por `StateManager.setConnectionStatus(...)`.

- **Abertura rápida de mensagem (popup → panel.html#quick-message)**:
  - O popup abria `panel.html#quick-message`, mas não existe módulo `quick-message`, gerando erro de navegação.
  - Corrigido: hash `#quick-message` é tratado como ação especial e abre o modal **Nova Mensagem** após carregar o Dashboard.

- **Busca global: clique em módulos não navegava corretamente**:
  - `ModuleLoader.listModules()` retornava `name` sobrescrito (nome exibido), perdendo a **chave real do módulo**.
  - Corrigido: agora retorna `id` (chave do módulo) e `name` (nome exibido). O clique navega usando `id`.

- **Backend CRM: resposta de tags inconsistente**:
  - `POST /crm/deals`, `PATCH /crm/deals/:id` e `GET /crm/deals/external/:externalId` retornavam `tags` em formato de join (`DealTag`).
  - Corrigido: todos retornam `tags` normalizadas como array `{id,name,color}`.

## Fixes adicionais (Créditos + Envio + Segurança)

- **Resgate de créditos (voucher/topup) não atualizava o total no painel**:
  - O frontend esperava `creditsTotal/creditsAdded`, mas o backend retornava `aiCredits/added`.
  - Corrigido: backend agora retorna **ambos** (`creditsTotal/creditsAdded` e `aiCredits/added`) e o frontend também faz fallback.

- **CRM: não era possível remover TODAS as tags de um contato**:
  - O backend só atualizava tags quando `tags.length > 0`. Se o usuário desmarcasse todas e enviasse `tags: []`, as tags antigas permaneciam.
  - Corrigido: se `tags` vier no payload (mesmo vazio), o backend substitui os vínculos. Também aceita tags como string ou objeto (`{name/label,color}`).

- **Envio rápido (Nova Mensagem) / envios em massa podiam falhar**:
  - Bug no `inject.js`: `Utils.sendMessage` usava `this.getChat(...)` (handler de comando) em vez de `this.Utils.getChat(...)`.
  - Corrigido: agora usa o util correto, e `getChat` tem fallback para diferentes métodos do Store (`findImpl`, `find`, etc.).

- **SubscriptionManager: contadores diários com chave errada**:
  - A chave inicial era `messagestoday`, mas o restante do código usava `messagesToday`, gerando `NaN` e bloqueios indevidos.
  - Corrigido: normalização automática (migra legado), e `incrementUsage` usa mapeamento correto.

- **Segurança (versão paga): emissão de licença aberta**:
  - `/license/issue` era público.
  - Corrigido: por padrão exige header `x-admin-token` (env `ADMIN_TOKEN`). Para testes, defina `ALLOW_PUBLIC_LICENSE_ISSUE=true`.

- **Envio em massa com anexos corrigido (Bulk → Backend/API)**:
  - O `bulk.js` estava enviando apenas o trecho base64 (sem o prefixo `data:<mime>;base64,`), mas o backend esperava **DataURL**.
  - Agora a extensão envia o DataURL completo, e o backend também ficou mais tolerante (aceita DataURL ou base64 puro).
