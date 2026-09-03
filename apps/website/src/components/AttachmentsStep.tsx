import { useRef, useState } from "react";
import { uploadFile } from "../api";

interface Props {
  attachments: string[];
  onChange: (attachments: string[]) => void;
  onBack: () => void;
  onNext: () => void;
}

export function AttachmentsStep({ attachments, onChange, onBack, onNext }: Props) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function updateAt(i: number, value: string) {
    const next = [...attachments];
    next[i] = value;
    onChange(next);
  }
  function addRow() {
    onChange([...attachments, ""]);
  }
  function removeAt(i: number) {
    onChange(attachments.filter((_, idx) => idx !== i));
  }

  async function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const { fileUrl } = await uploadFile(file);
      onChange([...attachments, fileUrl]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="form-section card">
      <p className="hint" style={{ marginBottom: 16 }}>
        Attach any supporting documents (screenshots, receipts, photos). This is optional.
      </p>

      {uploadError && <div className="error-banner">{uploadError}</div>}

      <div style={{ marginBottom: 16 }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,application/pdf"
          onChange={handleFilePicked}
          disabled={uploading}
        />
        {uploading && <span className="hint" style={{ marginLeft: 8 }}>Uploading…</span>}
        <p className="hint" style={{ marginTop: 4 }}>PNG, JPEG, WEBP, or PDF — up to 10MB.</p>
      </div>

      {attachments.map((url, i) => (
        <div className="attachment-row" key={i}>
          <input
            type="text"
            value={url}
            onChange={(e) => updateAt(i, e.target.value)}
            placeholder="https://... (or use the file picker above)"
          />
          <button type="button" className="btn" onClick={() => removeAt(i)}>
            Remove
          </button>
        </div>
      ))}

      <button type="button" className="btn-text" onClick={addRow}>
        + Add a link instead
      </button>

      <div className="actions">
        <button type="button" className="btn" onClick={onBack}>
          Back
        </button>
        <button type="button" className="btn btn-primary" onClick={onNext} disabled={uploading}>
          Next: Review
        </button>
      </div>
    </div>
  );
}
