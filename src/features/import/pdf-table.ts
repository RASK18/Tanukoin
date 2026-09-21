export interface PdfText {
  x: number;
  y: number;
  width: number;
  text: string;
}

interface StatementColumns {
  dateX: number;
  amountLeft: number;
  balanceLeft: number;
  descriptionLeft: number;
}

// The FE.ANOTAC / IMPORTE / SALDO / CONCEPTO certificate uses three
// narrow columns followed by a wide, centred, multiline description column.
export function detectStatementColumns(
  items: PdfText[],
): StatementColumns | undefined {
  const date = items.find((item) => item.text.trim() === "FE.ANOTAC");
  if (!date) return;
  const header = (text: string) =>
    items.find(
      (item) => item.text.trim() === text && Math.abs(item.y - date.y) < 3,
    );
  const amount = header("IMPORTE"),
    balance = header("SALDO"),
    description = header("CONCEPTO");
  if (
    !amount ||
    !balance ||
    !description ||
    !(date.x < amount.x && amount.x < balance.x && balance.x < description.x)
  )
    return;
  const center = (item: PdfText) => item.x + item.width / 2;
  return {
    dateX: date.x,
    amountLeft: (center(date) + center(amount)) / 2,
    balanceLeft: (center(amount) + center(balance)) / 2,
    descriptionLeft: center(balance) + (center(balance) - center(amount)) / 2,
  };
}

export function statementRows(
  items: PdfText[],
  columns: StatementColumns,
): string[][] {
  const dates = items
    .filter(
      (item) =>
        Math.abs(item.x - columns.dateX) < 5 &&
        /^\d{2}\/\d{2}\/\d{4}$/.test(item.text.trim()),
    )
    .sort((a, b) => b.y - a.y);
  const header = items.find((item) => item.text.trim() === "FE.ANOTAC");
  const rows = [["Fecha", "Concepto", "Importe", "Saldo"]];
  dates.forEach((date, index) => {
    // Amount/date cells are bottom aligned: all preceding description lines
    // since the previous date belong to this row, including on headerless pages.
    const top = index
      ? dates[index - 1].y - 2
      : header
        ? header.y - 3
        : date.y + 48;
    const description = items
      .filter(
        (item) =>
          item.x >= columns.descriptionLeft &&
          item.y <= top &&
          item.y >= date.y - 2,
      )
      .sort((a, b) => (Math.abs(a.y - b.y) < 2 ? a.x - b.x : b.y - a.y))
      .map((item) => item.text.trim())
      .join(" ")
      .replace(/\s+/g, " ");
    const cell = (left: number, right: number) =>
      items
        .filter(
          (item) =>
            item.x >= left && item.x < right && Math.abs(item.y - date.y) < 2,
        )
        .sort((a, b) => a.x - b.x)
        .map((item) => item.text.trim())
        .join("");
    // Keep incomplete rows so the normal validation reports them to the user.
    rows.push([
      date.text.trim(),
      description,
      cell(columns.amountLeft, columns.balanceLeft),
      cell(columns.balanceLeft, columns.descriptionLeft),
    ]);
  });
  return rows;
}
