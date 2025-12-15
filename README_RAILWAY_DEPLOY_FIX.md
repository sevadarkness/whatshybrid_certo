# Railway Deploy Fix (Monorepo)

Este pacote foi ajustado para o Railway/Railpack usando **Dockerfile na raiz**.

## O que mudou
- Adicionado `Dockerfile` na raiz (build do `backend/`)
- Adicionado `railway.toml` forçando builder DOCKERFILE
- Mantido `backend/` e `extension/` como no projeto original
- (Opcional) `start.sh` e `Procfile` como fallback

## Deploy no Railway
1. Conecte este repositório no Railway
2. **Clear build cache** (Settings) e redeploy
3. Configure variáveis de ambiente (ex.: `DATABASE_URL`, etc.) quando aparecerem erros de runtime.
