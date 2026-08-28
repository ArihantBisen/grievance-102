export function Confirmation({ ticketId }: { ticketId: string }) {
  return (
    <div className="confirmation card">
      <span className="badge badge-accent">Submitted</span>
      <h2>Thanks — we've got it.</h2>
      <p>Your ticket reference is</p>
      <p className="ticket-id mono">{ticketId}</p>
      <p className="hint">
        We'll message you on WhatsApp as your ticket progresses. You can also ask "status" on
        WhatsApp any time to check where things stand.
      </p>
    </div>
  );
}
