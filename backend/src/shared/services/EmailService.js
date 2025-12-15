/**
 * @fileoverview EmailService
 *
 * NOTE:
 * This implementation is "safe by default": if you don't configure a provider,
 * it will just log the emails to the console (so flows/auth still work in dev).
 *
 * Supported providers (minimal):
 * - log (default)
 *
 * You can replace this file with your preferred provider (Resend, SES, Sendgrid, SMTP...).
 */

const config = require('../../config');
const logger = require('../../infra/logging/Logger');

function safeUrl(base, path) {
  const b = String(base || '').replace(/\/$/, '');
  const p = String(path || '').replace(/^\//, '');
  return `${b}/${p}`;
}

class EmailService {
  constructor() {
    this.provider = (config.email?.provider || 'log').toLowerCase();
    this.from = config.email?.from || 'no-reply@localhost';
    this.baseUrl = config.email?.baseUrl || config.baseUrl || 'http://localhost:4000';
  }

  async sendEmail({ to, subject, text = '', html = '' }) {
    if (!to) throw new Error('EmailService.sendEmail: `to` é obrigatório');
    if (!subject) throw new Error('EmailService.sendEmail: `subject` é obrigatório');

    // Provider: log
    if (this.provider === 'log') {
      logger.info({
        msg: '[EMAIL:LOG] Email (não enviado de verdade) — configure EMAIL_PROVIDER para produção',
        to,
        from: this.from,
        subject,
        textPreview: String(text || '').slice(0, 200),
      });
      if (html) {
        logger.debug({ msg: '[EMAIL:LOG] HTML', html });
      }
      return { provider: 'log', queued: true };
    }

    // Unknown provider
    logger.warn({ msg: 'EMAIL_PROVIDER desconhecido — fallback para log', provider: this.provider, to, subject });
    return { provider: 'log', queued: true };
  }

  async sendEmailVerification({ to, name, token }) {
    const link = safeUrl(this.baseUrl, `verify-email?token=${encodeURIComponent(token)}`);
    const subject = 'Verificação de email';
    const text = `Olá ${name || ''}!\n\nClique para verificar seu email: ${link}`;
    const html = `<p>Olá ${name || ''}!</p><p>Clique para verificar seu email:</p><p><a href="${link}">${link}</a></p>`;
    return this.sendEmail({ to, subject, text, html });
  }

  async sendPasswordReset({ to, name, token }) {
    const link = safeUrl(this.baseUrl, `reset-password?token=${encodeURIComponent(token)}`);
    const subject = 'Redefinição de senha';
    const text = `Olá ${name || ''}!\n\nClique para redefinir sua senha: ${link}`;
    const html = `<p>Olá ${name || ''}!</p><p>Clique para redefinir sua senha:</p><p><a href="${link}">${link}</a></p>`;
    return this.sendEmail({ to, subject, text, html });
  }

  async sendPasswordChanged({ to, name }) {
    const subject = 'Senha alterada';
    const text = `Olá ${name || ''}!\n\nSua senha foi alterada com sucesso.`;
    const html = `<p>Olá ${name || ''}!</p><p>Sua senha foi alterada com sucesso.</p>`;
    return this.sendEmail({ to, subject, text, html });
  }

  async sendWorkspaceInvite({ to, workspaceName, inviterName, role, message, token }) {
    const link = safeUrl(this.baseUrl, `accept-invite?token=${encodeURIComponent(token)}`);
    const subject = `Convite para o workspace ${workspaceName}`;
    const text =
      `Você recebeu um convite para o workspace "${workspaceName}"` +
      `\nDe: ${inviterName || 'um usuário'}\nFunção: ${role || ''}` +
      (message ? `\n\nMensagem: ${message}` : '') +
      `\n\nAceitar convite: ${link}`;
    const html =
      `<p>Você recebeu um convite para o workspace <b>${workspaceName}</b></p>` +
      `<p>De: ${inviterName || 'um usuário'}<br/>Função: ${role || ''}</p>` +
      (message ? `<p><i>${message}</i></p>` : '') +
      `<p>Aceitar convite: <a href="${link}">${link}</a></p>`;
    return this.sendEmail({ to, subject, text, html });
  }
}

module.exports = new EmailService();
