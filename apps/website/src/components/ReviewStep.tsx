import type { TicketType } from "@sboss/shared-types";
import type { DepartmentTree, IdentityContext } from "../types";

interface Props {
  identity: IdentityContext;
  tree: DepartmentTree[];
  ticketType: TicketType;
  departmentId: string;
  categoryId: string;
  subcategoryId: string;
  referenceNote: string;
  body: string;
  attachments: string[];
  submitting: boolean;
  error: string | null;
  onBack: () => void;
  onSubmit: () => void;
}

export function ReviewStep(props: Props) {
  const {
    identity,
    tree,
    ticketType,
    departmentId,
    categoryId,
    subcategoryId,
    referenceNote,
    body,
    attachments,
    submitting,
    error,
    onBack,
    onSubmit,
  } = props;

  const department = tree.find((d) => d.id === departmentId);
  const category = department?.categories.find((c) => c.id === categoryId);
  const subcategory = category?.subcategories.find((s) => s.id === subcategoryId);
  const nonEmptyAttachments = attachments.filter((a) => a.trim());

  return (
    <div className="form-section card">
      {error && <div className="error-banner">{error}</div>}

      <dl>
        <div className="review-block">
          <dt>Submitted by</dt>
          <dd>
            {identity.name} ({identity.role})
          </dd>
        </div>
        <div className="review-block">
          <dt>Type</dt>
          <dd>{ticketType === "REQUEST" ? "Request" : "Grievance"}</dd>
        </div>
        <div className="review-block">
          <dt>Category</dt>
          <dd>
            {department?.name} → {category?.name} → {subcategory?.name}
          </dd>
        </div>
        {category?.isConfidential && (
          <div className="review-block">
            <dd>
              <span className="badge badge-purple">Confidential — HR committee only</span>
            </dd>
          </div>
        )}
        {ticketType === "REQUEST" && referenceNote && (
          <div className="review-block">
            <dt>Reference</dt>
            <dd>{referenceNote}</dd>
          </div>
        )}
        <div className="review-block">
          <dt>Details</dt>
          <dd style={{ whiteSpace: "pre-wrap" }}>{body}</dd>
        </div>
        <div className="review-block">
          <dt>Attachments</dt>
          <dd>
            {nonEmptyAttachments.length === 0
              ? "None"
              : nonEmptyAttachments.map((a) => (
                  <div key={a} className="mono" style={{ fontSize: 12 }}>
                    {a}
                  </div>
                ))}
          </dd>
        </div>
      </dl>

      <div className="actions">
        <button type="button" className="btn" onClick={onBack} disabled={submitting}>
          Back
        </button>
        <button type="button" className="btn btn-primary" onClick={onSubmit} disabled={submitting}>
          {submitting ? "Submitting…" : "Submit"}
        </button>
      </div>
    </div>
  );
}
