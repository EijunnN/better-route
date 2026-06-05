/**
 * Colored .xlsx import template via ExcelJS.
 *
 * Why ExcelJS and not the SheetJS `xlsx` already in the repo: SheetJS's free
 * build can read .xlsx but cannot WRITE cell fills (styling is a paid feature),
 * and the whole point here is to paint required columns. ExcelJS writes full
 * styles. This module is server-only (imported just by the template route) so
 * ExcelJS never reaches the client bundle — the browser only ever READS .xlsx,
 * which SheetJS handles.
 *
 * Required columns get a yellow header, optional ones a light-gray header, plus
 * per-column comments and a "Leyenda" sheet explaining the colors.
 */

import ExcelJS from "exceljs";
import { defaultExample } from "./template";
import type { ProfileSchema } from "./types";

const REQUIRED_FILL = "FFFFE699"; // soft yellow
const OPTIONAL_FILL = "FFF2F2F2"; // light gray
const HEADER_TEXT = "FF1F2937";
const BORDER = "FFD0D0D0";

export async function generateXlsxTemplate(
  schema: ProfileSchema,
  options: { locale?: "en" | "es" } = {},
): Promise<ArrayBuffer> {
  const { locale = "es" } = options;

  const wb = new ExcelJS.Workbook();
  wb.creator = "BetterRoute";
  const ws = wb.addWorksheet("Pedidos", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  schema.fields.forEach((field, i) => {
    const colIndex = i + 1;
    const label =
      locale === "en" && field.labelEn ? field.labelEn : field.label;

    const header = ws.getRow(1).getCell(colIndex);
    header.value = label;
    header.font = { bold: true, color: { argb: HEADER_TEXT } };
    header.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: field.required ? REQUIRED_FILL : OPTIONAL_FILL },
    };
    header.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };
    header.border = {
      top: { style: "thin", color: { argb: BORDER } },
      bottom: { style: "thin", color: { argb: BORDER } },
      left: { style: "thin", color: { argb: BORDER } },
      right: { style: "thin", color: { argb: BORDER } },
    };
    header.note = `${field.description || label}\n${
      field.required ? "Columna REQUERIDA" : "Columna opcional"
    }`;

    ws.getRow(2).getCell(colIndex).value = defaultExample(
      field.example,
      field.kind,
    );
    ws.getColumn(colIndex).width = Math.min(Math.max(label.length + 6, 14), 32);
  });
  ws.getRow(1).height = 26;

  // Legend sheet — explains the header colors.
  const legend = wb.addWorksheet("Leyenda");
  legend.getColumn(1).width = 16;
  legend.getColumn(2).width = 70;

  const reqCell = legend.getCell("A1");
  reqCell.value = "Requerida";
  reqCell.font = { bold: true };
  reqCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: REQUIRED_FILL },
  };
  legend.getCell("B1").value =
    "Columna obligatoria: debe estar presente y con valor en cada fila.";

  const optCell = legend.getCell("A2");
  optCell.value = "Opcional";
  optCell.font = { bold: true };
  optCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: OPTIONAL_FILL },
  };
  legend.getCell("B2").value =
    "Columna opcional: podés dejarla vacía o quitarla.";

  const tip = legend.getCell("A4");
  tip.value = "Tip";
  tip.font = { bold: true };
  legend.getCell("B4").value =
    'La fila 2 de la hoja "Pedidos" es un ejemplo — reemplazala con tus datos. ' +
    "Podés subir este mismo .xlsx o guardarlo como CSV.";

  const buf = await wb.xlsx.writeBuffer();
  return buf as ArrayBuffer;
}
