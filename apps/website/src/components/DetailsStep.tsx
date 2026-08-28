import type { TicketType } from "@sboss/shared-types";
import type { DepartmentTree } from "../types";

interface Props {
  tree: DepartmentTree[];
  loading: boolean;
  canRequest: boolean;
  ticketType: TicketType;
  onTicketTypeChange: (t: TicketType) => void;
  departmentId: string;
  categoryId: string;
  subcategoryId: string;
  onDepartmentChange: (id: string) => void;
  onCategoryChange: (id: string) => void;
  onSubcategoryChange: (id: string) => void;
  referenceNote: string;
  onReferenceNoteChange: (v: string) => void;
  body: string;
  onBodyChange: (v: string) => void;
  onNext: () => void;
}

export function DetailsStep(props: Props) {
  const {
    tree,
    loading,
    canRequest,
    ticketType,
    onTicketTypeChange,
    departmentId,
    categoryId,
    subcategoryId,
    onDepartmentChange,
    onCategoryChange,
    onSubcategoryChange,
    referenceNote,
    onReferenceNoteChange,
    body,
    onBodyChange,
    onNext,
  } = props;

  const department = tree.find((d) => d.id === departmentId);
  const category = department?.categories.find((c) => c.id === categoryId);
  const canProceed = Boolean(departmentId && categoryId && subcategoryId && body.trim());

  return (
    <div className="form-section card">
      {canRequest && (
        <div className="ticket-type-toggle">
          <button
            type="button"
            className={ticketType === "GRIEVANCE" ? "active" : ""}
            onClick={() => onTicketTypeChange("GRIEVANCE")}
          >
            Report a Grievance
          </button>
          <button
            type="button"
            className={ticketType === "REQUEST" ? "active" : ""}
            onClick={() => onTicketTypeChange("REQUEST")}
          >
            Raise a Request
          </button>
        </div>
      )}

      {loading && <p className="hint">Loading categories…</p>}

      <div className="form-row">
        <label htmlFor="department">Department</label>
        <select
          id="department"
          value={departmentId}
          onChange={(e) => onDepartmentChange(e.target.value)}
        >
          <option value="">Select a department</option>
          {tree.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      <div className="form-row">
        <label htmlFor="category">Category</label>
        <select
          id="category"
          value={categoryId}
          onChange={(e) => onCategoryChange(e.target.value)}
          disabled={!department}
        >
          <option value="">Select a category</option>
          {department?.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="form-row">
        <label htmlFor="subcategory">Subcategory</label>
        <select
          id="subcategory"
          value={subcategoryId}
          onChange={(e) => onSubcategoryChange(e.target.value)}
          disabled={!category}
        >
          <option value="">Select a subcategory</option>
          {category?.subcategories.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {ticketType === "REQUEST" && (
        <div className="form-row">
          <label htmlFor="referenceNote">Reference (case/sanction/employee ID being asked about)</label>
          <input
            id="referenceNote"
            type="text"
            value={referenceNote}
            onChange={(e) => onReferenceNoteChange(e.target.value)}
            placeholder="e.g. Case #4521"
          />
        </div>
      )}

      <div className="form-row">
        <label htmlFor="body">
          {ticketType === "REQUEST" ? "What do you need?" : "Describe the issue"}
        </label>
        <textarea
          id="body"
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
          placeholder={
            ticketType === "REQUEST"
              ? "e.g. Please confirm whether this case has been sanctioned."
              : "Tell us what happened, when, and where — as much detail as you can."
          }
        />
      </div>

      <div className="actions">
        <span />
        <button type="button" className="btn btn-primary" disabled={!canProceed} onClick={onNext}>
          Next: Supporting Documents
        </button>
      </div>
    </div>
  );
}
