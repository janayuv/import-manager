//! Deterministic XLSX → structured text for LLM consumption (not vision).
//!
//! Workbooks are opened with [`calamine::open_workbook_auto_from_rs`], the same
//! “auto” detection as [`calamine::open_workbook_auto`] but for in-memory data.

use std::io::Cursor;

use calamine::{
    open_workbook_auto_from_rs, Data, DataType, Reader, Sheet, SheetType, SheetVisible, Sheets,
};

/// User-facing error when the workbook cannot be read or the first visible sheet is unusable.
pub const EXCEL_PARSE_ERR: &str = "Failed to parse Excel file.";

const COL_LABELS: [&str; 4] = ["Item", "Part Number", "Quantity", "Unit Price"];

/// Turn an Excel workbook into a single text block the model can parse.
pub fn parse_excel_invoice(file_bytes: &[u8]) -> Result<String, String> {
    let cursor = Cursor::new(file_bytes.to_vec());
    let mut workbook: Sheets<_> =
        open_workbook_auto_from_rs(cursor).map_err(|_| EXCEL_PARSE_ERR.to_string())?;

    let name: String = first_visible_worksheet_name(&workbook)
        .ok_or_else(|| EXCEL_PARSE_ERR.to_string())?;

    let range = workbook
        .worksheet_range(&name)
        .map_err(|_| EXCEL_PARSE_ERR.to_string())?;

    let mut blocks: Vec<String> = Vec::new();
    for row in range.rows() {
        if let Some(block) = format_row(row) {
            blocks.push(block);
        }
    }

    Ok(blocks.join("\n\n"))
}

/// First worksheet in document order that is not hidden/very hidden and is a data worksheet.
fn first_visible_worksheet_name<RS: std::io::Read + std::io::Seek>(
    workbook: &Sheets<RS>,
) -> Option<String> {
    for sheet in workbook.sheets_metadata() {
        if is_visible(sheet) && is_data_sheet(sheet) {
            return Some(sheet.name.clone());
        }
    }
    None
}

fn is_visible(s: &Sheet) -> bool {
    s.visible == SheetVisible::Visible
}

fn is_data_sheet(s: &Sheet) -> bool {
    matches!(
        s.typ,
        SheetType::WorkSheet | SheetType::DialogSheet | SheetType::MacroSheet
    )
}

fn format_row(row: &[Data]) -> Option<String> {
    let mut lines: Vec<String> = Vec::new();
    for (i, cell) in row.iter().enumerate() {
        if cell.is_empty() {
            continue;
        }
        let v = cell_to_display(cell);
        if v.is_empty() {
            continue;
        }
        if let Some(&label) = COL_LABELS.get(i) {
            lines.push(format!("{label}: {v}"));
        } else {
            lines.push(format!("Column {}: {v}", i + 1));
        }
    }
    if lines.is_empty() {
        None
    } else {
        Some(lines.join("\n"))
    }
}

fn cell_to_display(cell: &Data) -> String {
    // Avoid excessive decimal noise for whole floats.
    if let Data::Float(f) = cell {
        if f.fract() == 0.0 && f.is_finite() {
            return format!("{:.0}", f);
        }
    }
    cell.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    use rust_xlsxwriter::{Workbook, XlsxError};

    fn one_row_excel() -> Result<Vec<u8>, XlsxError> {
        let mut workbook = Workbook::new();
        let sheet = workbook.add_worksheet();
        sheet.write_string(0, 0, "Bolt")?;
        sheet.write_string(0, 1, "P-1001")?;
        sheet.write_number(0, 2, 100.0)?;
        sheet.write_number(0, 3, 12.5)?;
        workbook.save_to_buffer()
    }

    #[test]
    fn valid_parsing_includes_labeled_line_item() {
        let buf = one_row_excel().expect("xlsx");
        let text = parse_excel_invoice(&buf).expect("parse");
        assert!(text.contains("Item: Bolt"), "{text}");
        assert!(text.contains("Part Number: P-1001"), "{text}");
        assert!(text.contains("Quantity: 100"), "{text}");
        assert!(text.contains("Unit Price:") && text.contains("12.5"), "{text}");
    }

    #[test]
    fn empty_worksheet_yields_empty_string() {
        let mut workbook = Workbook::new();
        let _ = workbook.add_worksheet();
        let buf = workbook.save_to_buffer().expect("xlsx");
        let text = parse_excel_invoice(&buf).expect("parse");
        assert_eq!(text, "");
    }

    #[test]
    fn multiple_rows_parsing() {
        let mut workbook = Workbook::new();
        let sheet = workbook.add_worksheet();
        sheet.write_string(0, 0, "A1").unwrap();
        sheet.write_string(0, 1, "PN-1").unwrap();
        sheet.write_string(1, 0, "A2").unwrap();
        sheet.write_string(1, 1, "PN-2").unwrap();
        let buf = workbook.save_to_buffer().expect("xlsx");
        let text = parse_excel_invoice(&buf).expect("parse");
        let groups: Vec<_> = text.split("\n\n").collect();
        assert_eq!(groups.len(), 2, "{text}");
        assert!(text.contains("Item: A1"));
        assert!(text.contains("Item: A2"));
    }
}
