export function createCsvOutput() {
  return function outputRow(row: Record<string, unknown>) {
    console.log(Object.values(row));
  };
}
