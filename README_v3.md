# WhatsHybrid CRM & AI Suite v3 (otimizado)

# WhatsHybrid CRM & AI Suite v2

Esta é a versão 2.0 do pacote híbrido:

- **Extensão Chrome (`extension/`)** com:
  - CRM embutido no WhatsApp Web (painel lateral com estágios, tags, notas e telefone).
  - Kanban completo em `dashboard.html` sincronizado com backend.
  - Campanhas em massa avançadas (`bulk.html`) com intervalo, lote, perfil de envio e agendamento.
  - Automações (Flows) em `flows.html` com configuração JSON e execução no backend.
  - Tela de Time & Tarefas (`team.html`) para multioperador e gestão de tarefas.
  - Respostas rápidas com variáveis, botão de IA, destaques visuais de mensagens, botões por mensagem, contexto menu.
  - Badge de não lidas e controle de aba única no WhatsApp Web.

- **Backend Node/Express (`backend/`)** com:
  - Prisma/SQLite para persistência robusta (Deals, Tags, Campaigns, Flows, MessageEvents, Users, Tasks).
  - Endpoints de IA, CRM, campanhas, flows, eventos e tarefas.
  - socket.io para transmitir eventos de mensagens em tempo (consumo opcional por dashboards externos).

Siga:

- `README_BACKEND_v2.md` para subir o backend.
- `README_EXTENSION_v2.md` para carregar a extensão no Chrome.
