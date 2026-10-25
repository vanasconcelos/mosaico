#!/usr/bin/env node
/**
 * Verificação somente leitura do estado do Supabase, usando só a chave
 * `anon` já configurada em `.env.local` — a mesma que o site usa em
 * produção. Nunca precisa da chave `service_role` nem de nada colado
 * no chat: só confirma, pela resposta HTTP de cada tabela, se ela
 * existe e qual o nível de acesso do papel `anon`.
 *
 * Como interpretar:
 *   - 200 com uma lista (mesmo vazia) → tabela existe, `anon` tem SELECT.
 *   - 401 "permission denied for table X" (código 42501) → a tabela
 *     EXISTE, mas `anon` não tem SELECT nela — esperado para
 *     `templates`, `profiles` e `purchases`, que só devem ser lidas
 *     via `templates_preview` ou por usuário autenticado.
 *   - 404 / "could not find the table" → a tabela realmente não existe.
 *
 * Uso: npm run check:db
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(projectRoot, ".env.local");

let env;
try {
  env = Object.fromEntries(
    readFileSync(envPath, "utf8")
      .split("\n")
      .filter((line) => line.includes("="))
      .map((line) => {
        const i = line.indexOf("=");
        return [line.slice(0, i), line.slice(i + 1)];
      }),
  );
} catch {
  console.error(`Não encontrei ${envPath} — crie o .env.local antes de rodar esta verificação.`);
  process.exit(1);
}

const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: key } = env;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY ausentes em .env.local.");
  process.exit(1);
}

const targets = ["kits", "packs", "templates", "tags", "template_tags", "profiles", "purchases", "templates_preview"];

console.log(`Verificando ${url} ...\n`);

for (const table of targets) {
  const res = await fetch(`${url}/rest/v1/${table}?select=*&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const body = await res.json().catch(() => null);

  if (res.status === 200) {
    console.log(`✓ ${table.padEnd(18)} existe — anon consegue ler (SELECT liberado)`);
  } else if (body?.code === "42501") {
    console.log(`✓ ${table.padEnd(18)} existe — anon SEM acesso de leitura (RLS/privilégio, esperado para dados privados)`);
  } else if (body?.code === "PGRST205" || res.status === 404) {
    console.log(`✗ ${table.padEnd(18)} NÃO ENCONTRADA`);
  } else {
    console.log(`? ${table.padEnd(18)} resposta inesperada — HTTP ${res.status}: ${JSON.stringify(body)}`);
  }
}
