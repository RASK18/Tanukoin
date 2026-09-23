/** Physical PDF page numbers, independent of preview navigation and table headers. */
export function parsePageRanges(input: string, total: number): number[] {
  if (!input.trim()) throw new Error("Indica al menos una página o un rango.");
  const pages = new Set<number>();
  for (const part of input.split(",")) {
    const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match)
      throw new Error("Utiliza páginas y rangos, por ejemplo: 1-8, 12, 20-29.");
    const start = Number(match[1]),
      end = Number(match[2] ?? match[1]);
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 1 ||
      end > total
    )
      throw new Error(`Las páginas deben estar entre 1 y ${total}.`);
    if (start > end)
      throw new Error("El inicio de un rango no puede ser mayor que el final.");
    for (let page = start; page <= end; page++) pages.add(page);
  }
  return [...pages].sort((a, b) => a - b);
}
