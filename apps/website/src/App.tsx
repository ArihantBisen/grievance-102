import { useEffect, useMemo, useState } from "react";
import type { Role, TicketType } from "@sboss/shared-types";
import { addAttachment, createTicket, fetchCategories, fetchIdentity } from "./api";
import { IdentityStrip } from "./components/IdentityStrip";
import { Stepper } from "./components/Stepper";
import { DetailsStep } from "./components/DetailsStep";
import { AttachmentsStep } from "./components/AttachmentsStep";
import { ReviewStep } from "./components/ReviewStep";
import { Confirmation } from "./components/Confirmation";
import type { DepartmentTree, IdentityContext } from "./types";

// ADR-007 (updated Aug 25) — mirrors apps/api's REQUEST_ELIGIBLE_ROLES.
const REQUEST_ELIGIBLE_ROLES = new Set<Role>(["TEAM_LEAD", "TM", "CM", "SBI_DEPUTED"]);

export function App() {
  // Stand-in for the signed submission link (ADR-002's GET /api/webform/:token) until
  // JWT auth exists: the identity is read straight from a query param instead of being
  // decoded from a signed token server-side. Replace this with the real signed-link
  // flow once Part E step 8 lands — nothing else about the form changes.
  const identityId = useMemo(() => new URLSearchParams(window.location.search).get("identityId"), []);

  const [identity, setIdentity] = useState<IdentityContext | null>(null);
  const [identityError, setIdentityError] = useState<string | null>(null);

  const [ticketType, setTicketType] = useState<TicketType>("GRIEVANCE");
  const [tree, setTree] = useState<DepartmentTree[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [departmentId, setDepartmentId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [referenceNote, setReferenceNote] = useState("");
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [ticketNumber, setTicketNumber] = useState<string | null>(null);

  useEffect(() => {
    if (!identityId) return;
    fetchIdentity(identityId)
      .then(setIdentity)
      .catch((e) => setIdentityError(e.message));
  }, [identityId]);

  useEffect(() => {
    if (!identity) return;
    setTreeLoading(true);
    setDepartmentId("");
    setCategoryId("");
    setSubcategoryId("");
    fetchCategories(identity.role, ticketType)
      .then(setTree)
      .catch((e) => setIdentityError(e.message))
      .finally(() => setTreeLoading(false));
  }, [identity, ticketType]);

  async function handleSubmit() {
    if (!identity) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const ticket = await createTicket({
        identityId: identity.id,
        categoryId,
        subcategoryId,
        channel: "WEB",
        ticketType,
        referenceNote: ticketType === "REQUEST" ? referenceNote || undefined : undefined,
        body,
      });
      for (const url of attachments) {
        if (url.trim()) {
          await addAttachment(ticket.id, url.trim(), identity.id);
        }
      }
      setTicketId(ticket.id);
      setTicketNumber(ticket.ticketNumber);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!identityId) {
    return (
      <div className="page">
        <div className="error-banner">
          No identity link found. Open this page from the link sent to you on WhatsApp.
        </div>
      </div>
    );
  }

  if (identityError) {
    return (
      <div className="page">
        <div className="error-banner">{identityError}</div>
      </div>
    );
  }

  if (!identity) {
    return (
      <div className="page">
        <p className="hint">Loading…</p>
      </div>
    );
  }

  if (ticketId) {
    return (
      <div className="page">
        <Confirmation ticketId={ticketId} ticketNumber={ticketNumber} />
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Submit a Grievance</h1>
        <p>SBOSS Grievance &amp; Request System</p>
      </div>

      <IdentityStrip identity={identity} />
      <Stepper current={step} />

      {step === 1 && (
        <DetailsStep
          tree={tree}
          loading={treeLoading}
          canRequest={REQUEST_ELIGIBLE_ROLES.has(identity.role)}
          ticketType={ticketType}
          onTicketTypeChange={setTicketType}
          departmentId={departmentId}
          categoryId={categoryId}
          subcategoryId={subcategoryId}
          onDepartmentChange={(id) => {
            setDepartmentId(id);
            setCategoryId("");
            setSubcategoryId("");
          }}
          onCategoryChange={(id) => {
            setCategoryId(id);
            setSubcategoryId("");
          }}
          onSubcategoryChange={setSubcategoryId}
          referenceNote={referenceNote}
          onReferenceNoteChange={setReferenceNote}
          body={body}
          onBodyChange={setBody}
          onNext={() => setStep(2)}
        />
      )}

      {step === 2 && (
        <AttachmentsStep
          attachments={attachments}
          onChange={setAttachments}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      )}

      {step === 3 && (
        <ReviewStep
          identity={identity}
          tree={tree}
          ticketType={ticketType}
          departmentId={departmentId}
          categoryId={categoryId}
          subcategoryId={subcategoryId}
          referenceNote={referenceNote}
          body={body}
          attachments={attachments}
          submitting={submitting}
          error={submitError}
          onBack={() => setStep(2)}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
