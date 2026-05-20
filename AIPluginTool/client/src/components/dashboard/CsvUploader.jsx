import { parseCsvFile } from "../../lib/csv";
import { useToast } from "../ui/ToastProvider.jsx";

export function CsvUploader({ label, source, onImported, onError }) {
  const toast = useToast();
  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const rows = parseCsvFile(text);
      const result = await onImported(source, rows);
      onError("");
      toast.success(`${label} import complete (${result.imported} rows).`);
    } catch (error) {
      onError(error.message);
    } finally {
      event.target.value = "";
    }
  };

  return (
    <label className="t1-btn inline-flex cursor-pointer items-center gap-2">
      <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
      Upload {label} CSV
    </label>
  );
}
