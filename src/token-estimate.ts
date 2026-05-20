/** Rough token estimate without proprietary tokenizer APIs (SPEC v1). */
export function estimateTokens(text: string): number {
  const bytes = Buffer.byteLength(text, 'utf8');
  return Math.max(1, Math.ceil(bytes / 4));
}
