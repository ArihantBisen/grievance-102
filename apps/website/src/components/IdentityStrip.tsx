import type { IdentityContext } from "../types";

export function IdentityStrip({ identity }: { identity: IdentityContext }) {
  return (
    <div className="identity-strip card">
      <div>
        <strong>{identity.name}</strong>
      </div>
      <div>
        <span>Role: </span>
        {identity.role}
      </div>
      {identity.designation && (
        <div>
          <span>Designation: </span>
          {identity.designation}
        </div>
      )}
      {identity.circle && (
        <div>
          <span>Circle: </span>
          {identity.circle}
        </div>
      )}
      {identity.branch && (
        <div>
          <span>Branch: </span>
          {identity.branch}
        </div>
      )}
    </div>
  );
}
