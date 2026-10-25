// Formato real dos slugs cadastrados (minúsculas, números, hífen simples
// entre palavras — sem hífen duplo, inicial ou final). Centralizado aqui
// porque era duplicado byte a byte em edit-link/route.ts e download/
// route.ts; agora também usado para validar o parâmetro `next` do login.
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SLUG_MAX_LENGTH = 120;

export function isValidSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= SLUG_MAX_LENGTH && SLUG_PATTERN.test(slug);
}
