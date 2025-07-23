// src/lib/date-format.ts (NEW FILE)
// A utility file to handle date formatting consistently.

// Converts a date string from "yyyy-mm-dd" (from input) or "dd-mm-yyyy" (from state) to "dd-mm-yyyy" for display.
export const formatDateForDisplay = (dateString: string | undefined | null): string => {
  if (!dateString) return '';
  // Check if it's already in dd-mm-yyyy
  if (/^\d{2}-\d{2}-\d{4}$/.test(dateString)) {
    return dateString;
  }
  // Assume it's yyyy-mm-dd and convert
  const parts = dateString.split('-');
  if (parts.length !== 3) return dateString;
  const [year, month, day] = parts;
  return `${day}-${month}-${year}`;
};

// Converts a date string from "dd-mm-yyyy" (from state) to "yyyy-mm-dd" for input[type="date"].
export const formatDateForInput = (dateString: string | undefined | null): string => {
  if (!dateString) return '';
  const parts = dateString.split('-');
  if (parts.length !== 3) return dateString;
  const [day, month, year] = parts;
  return `${year}-${month}-${day}`;
};