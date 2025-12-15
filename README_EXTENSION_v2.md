# WhatsHybrid CRM & AI Suite v2 – Extensão Chrome

Esta pasta `extension/` contém a segunda versão da extensão, com:

- CRM embutido no WhatsApp Web (painel lateral com estágios, tags, notas e telefone).
- Kanban completo em `dashboard.html` sincronizado com backend (`/crm/deals`).
- Campanhas em massa avançadas em `bulk.html` (intervalo, lote, perfil de envio, agendamento).
- Automações (Flows) em `flows.html` – edição de JSON de triggers/actions persistidas no backend.
- Tela de Time & Tarefas em `team.html` – lista usuários e tarefas do backend.
- Botão flutuante de IA para sugerir respostas com base no contexto do chat (`/ai/reply`).
- Respostas rápidas com variáveis ({{nome}}, {{telefone}}, {{vendedor}}) configuradas em `options.html`.
- Destaque automático de mensagens importantes (perguntas, menções a preço, prazo, etc.).
- Botões por mensagem para IA e criação de tarefa.
- Context menu “Salvar texto no CRM atual” no Chrome.
- Badge de não lidas e controle de aba única à la WAToolkit.

Para carregar em modo desenvolvedor:

1. Acesse `chrome://extensions`.
2. Ative o *Modo do desenvolvedor*.
3. Clique em **Carregar sem compactação**.
4. Selecione a pasta `extension/`.
