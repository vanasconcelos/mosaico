import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";
import { randomUUID } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
// Isolado por processo (`node --test` roda cada arquivo de teste em um
// processo próprio) — achado real desta auditoria: um CACHE_DIR
// compartilhado entre processos concorrentes causava corrupção
// intermitente quando dois processos compilavam o MESMO arquivo
// (ex.: src/lib/pricing.ts, importado tanto por checkout quanto por
// webhook) pro mesmo caminho de saída ao mesmo tempo — um processo
// podia ler o arquivo no meio da escrita do outro, durante o passo de
// reescrita dos aliases "@/...". Isolar por PID elimina qualquer
// estado mutável compartilhado entre processos de teste.
const CACHE_DIR = path.join(ROOT, "node_modules", ".mosaico-test-cache", String(process.pid));

const require = createRequire(path.join(CACHE_DIR, "noop.js"));

/**
 * Compila um conjunto de arquivos .ts (caminhos relativos à raiz do
 * projeto, ex.: "src/app/api/checkout/route.ts") para CommonJS dentro de
 * node_modules/.mosaico-test-cache/ (dentro de node_modules — já
 * ignorado pelo Git, nenhum artefato de teste é versionado).
 *
 * Depois da compilação, reescreve qualquer `require("@/...")` emitido
 * pelo tsc (que NÃO resolve path aliases no JS gerado, só no
 * type-check) para o caminho relativo correto dentro do próprio cache
 * — sem isso, o require() do Node quebraria em tempo de execução.
 */
export function compile(entryFiles) {
  mkdirSync(CACHE_DIR, { recursive: true });

  // Usa um tsconfig temporário que ESTENDE o tsconfig.json real do
  // projeto (pra herdar o mapeamento de "@/*" em compilerOptions.paths
  // — passar flags soltas na CLI nunca resolve paths, só o tsconfig
  // resolve), sobrescrevendo só o necessário pra emitir CommonJS
  // executável pelo Node puro, e restringindo "files" aos arquivos
  // realmente precisos (nunca compila o projeto inteiro).
  // Nome único por chamada — `node --test` roda arquivos de teste
  // diferentes em processos concorrentes; um nome fixo aqui causava uma
  // condição de corrida real (um processo sobrescrevendo o config do
  // outro no meio da compilação), mascarada antes só porque o bug do
  // `include` herdado compilava o projeto inteiro de qualquer forma,
  // então o resultado existia independente de qual config "vencesse".
  const tmpConfigPath = path.join(CACHE_DIR, `tsconfig.${randomUUID()}.tmp.json`);
  const tmpConfig = {
    extends: path.join(ROOT, "tsconfig.json"),
    compilerOptions: {
      module: "commonjs",
      moduleResolution: "node",
      noEmit: false,
      outDir: CACHE_DIR,
      rootDir: ROOT,
      incremental: false,
    },
    // `files`/`include` NÃO se mesclam com o config estendido — o valor
    // aqui SUBSTITUI o herdado. Precisa ser explícito: sem este
    // `include: []`, o `"include": ["**/*.ts", ...]` do tsconfig.json
    // real seria herdado e o projeto inteiro seria compilado junto
    // (confirmado: ~60 arquivos emitidos por uma chamada que devia
    // compilar só 2). Isso não só desperdiça tempo — faz módulos que
    // deveriam existir SÓ como fake (injectFakeModule) acabarem também
    // compilados de verdade no disco, mascarando por acidente um bug de
    // resolução que apareceria se o projeto nunca mudasse de tamanho.
    include: [],
    files: entryFiles.map((f) => path.join(ROOT, f)),
  };
  writeFileSync(tmpConfigPath, JSON.stringify(tmpConfig, null, 2));

  execFileSync(
    path.join(ROOT, "node_modules", ".bin", "tsc"),
    ["-p", tmpConfigPath],
    { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] },
  );

  fixAliases(CACHE_DIR);
}

function fixAliases(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      fixAliases(full);
      continue;
    }
    if (!entry.endsWith(".js")) continue;
    let content = readFileSync(full, "utf8");
    const before = content;
    content = content.replace(/require\("@\/([^"]+)"\)/g, (_match, aliasPath) => {
      const targetAbs = path.join(CACHE_DIR, "src", aliasPath);
      let rel = path.relative(path.dirname(full), targetAbs).replace(/\\/g, "/");
      if (!rel.startsWith(".")) rel = "./" + rel;
      return `require("${rel}")`;
    });
    if (content !== before) writeFileSync(full, content);
  }
}

/**
 * Injeta um módulo falso no cache do Node para um caminho de alias
 * "@/lib/xxx" (sem extensão), ANTES de requerer a rota real — explora o
 * cache de módulos por caminho resolvido: se o caminho já está no
 * cache, o require() da rota compilada devolve o fake em vez de ler o
 * arquivo verdadeiro (que nem precisa existir/ser compilado para esse
 * caminho específico).
 */
export function injectFakeModule(aliasPath, exportsObj) {
  const resolvedPath = path.join(CACHE_DIR, "src", aliasPath) + ".js";
  mkdirSync(path.dirname(resolvedPath), { recursive: true });
  // Escreve um stub real em disco (nunca o módulo de verdade) — a
  // resolução de módulo do Node exige que o ARQUIVO exista no sistema
  // de arquivos antes mesmo de consultar require.cache; depender só da
  // compilação acidental do projeto inteiro pra isso (como acontecia
  // antes da correção de `include: []` acima) seria frágil: bastaria o
  // projeto real nunca compilar esse arquivo (por um erro de tipo nele,
  // por exemplo) para a resolução falhar mesmo com o fake já no cache.
  writeFileSync(resolvedPath, "module.exports = {};\n");
  const fakeModule = new Module(resolvedPath, null);
  fakeModule.filename = resolvedPath;
  fakeModule.loaded = true;
  fakeModule.exports = exportsObj;
  require.cache[resolvedPath] = fakeModule;
  return resolvedPath;
}

/**
 * Injeta um módulo falso para um pacote externo real (ex.: "@supabase/ssr"),
 * diferente de injectFakeModule (que só cobre aliases internos "@/...",
 * reescritos por fixAliases). Resolve o caminho absoluto real do pacote a
 * partir da raiz do projeto e popula o mesmo cache de módulos do Node
 * (Module._cache é global por processo, não por instância de `require`) —
 * o `require("pacote")` emitido dentro do código compilado nunca chega a
 * carregar o pacote de verdade.
 */
export function injectFakeNodeModule(packageName, exportsObj) {
  const resolvedPath = require.resolve(packageName, { paths: [ROOT] });
  const fakeModule = new Module(resolvedPath, null);
  fakeModule.filename = resolvedPath;
  fakeModule.loaded = true;
  fakeModule.exports = exportsObj;
  require.cache[resolvedPath] = fakeModule;
  return resolvedPath;
}

export function clearModuleCache() {
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(CACHE_DIR)) delete require.cache[key];
  }
}

export function requireCompiled(entryRelPath) {
  // `.tsx?` (não só `.ts`) — achado real desta etapa: nenhum teste
  // anterior havia passado um arquivo `.tsx` (ex.: uma página do App
  // Router) como entrada direta de requireCompiled, então a troca de
  // extensão nunca precisou cobrir esse caso antes.
  const resolved = path.join(CACHE_DIR, entryRelPath.replace(/\.tsx?$/, ".js"));
  return require(resolved);
}

export { CACHE_DIR, require as cacheRequire };
