function escapeCsvValue(value: unknown) {
  const normalized = value == null ? "" : String(value);

  if (/[,"\n\r]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }

  return normalized;
}

export function stringifyCsv(
  headers: string[],
  rows: Array<Record<string, unknown>>,
) {
  const lines = [headers.map(escapeCsvValue).join(",")];

  for (const row of rows) {
    lines.push(headers.map((header) => escapeCsvValue(row[header])).join(","));
  }

  return `${lines.join("\n")}\n`;
}
