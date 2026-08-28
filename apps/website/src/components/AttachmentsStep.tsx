interface Props {
  attachments: string[];
  onChange: (attachments: string[]) => void;
  onBack: () => void;
  onNext: () => void;
}

export function AttachmentsStep({ attachments, onChange, onBack, onNext }: Props) {
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

  return (
    <div className="form-section card">
      <p className="hint" style={{ marginBottom: 16 }}>
        Attach any supporting documents (screenshots, receipts, photos). This is optional.
        {/* Object storage / real file upload isn't wired up yet (Part D2 lists it as a
            later piece) — this collects a file URL as a stand-in for now. */}
        For now, paste a link to the file rather than uploading it directly.
      </p>

      {attachments.map((url, i) => (
        <div className="attachment-row" key={i}>
          <input
            type="text"
            value={url}
            onChange={(e) => updateAt(i, e.target.value)}
            placeholder="https://..."
          />
          <button type="button" className="btn" onClick={() => removeAt(i)}>
            Remove
          </button>
        </div>
      ))}

      <button type="button" className="btn-text" onClick={addRow}>
        + Add another attachment
      </button>

      <div className="actions">
        <button type="button" className="btn" onClick={onBack}>
          Back
        </button>
        <button type="button" className="btn btn-primary" onClick={onNext}>
          Next: Review
        </button>
      </div>
    </div>
  );
}
