const SIGNED_AT_ROLES = {
  ansatt: "employeeSignedAt",
  arbeidsgiver: "employerSignedAt",
};

function parseSince(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

/**
 * Match portal signature rows back to roles. National id numbers are used
 * only as a join key and are not copied into the stored status.
 */
export function signerRowsFromChange(change, signers) {
  const used = new Set();
  const rows = [];
  for (const signature of change?.signatures || []) {
    let index = -1;
    if (signature.personalIdentificationNumber) {
      index = signers.findIndex((signer, signerIndex) => (
        !used.has(signerIndex) && signer.personalIdentificationNumber === signature.personalIdentificationNumber
      ));
    }
    if (index < 0) {
      index = signers.findIndex((signer, signerIndex) => (
        !used.has(signerIndex) && !signer.personalIdentificationNumber
      ));
    }
    if (index < 0) continue;
    used.add(index);
    const signer = signers[index];
    rows.push({
      role: signer.role,
      order: signer.order,
      status: signature.status || "WAITING",
      since: signature.since || null,
    });
  }
  signers.forEach((signer, index) => {
    if (used.has(index)) return;
    rows.push({ role: signer.role, order: signer.order, status: "WAITING", since: null });
  });
  return rows.sort((a, b) => a.order - b.order);
}

export function contractFieldsFromChange(change, signers) {
  const signerStatus = signerRowsFromChange(change, signers);
  const byRole = Object.fromEntries(signerStatus.map((row) => [row.role, row.status]));
  const failedSigner = signerStatus.some((row) => (
    ["REJECTED", "CANCELLED", "BLOCKED", "EXPIRED"].includes(row.status)
  ));
  let contractStatus = "sendt";
  if (
    change.status === "COMPLETED_SUCCESSFULLY"
    || (byRole.ansatt === "SIGNED" && byRole.arbeidsgiver === "SIGNED")
  ) {
    contractStatus = "signert";
  } else if (change.status === "FAILED" || failedSigner) {
    contractStatus = signerStatus.some((row) => row.status === "EXPIRED") ? "utlopt" : "avvist";
  } else if (byRole.ansatt === "SIGNED") {
    contractStatus = "signert_ansatt";
  }

  const signedAt = {};
  for (const row of signerStatus) {
    const key = SIGNED_AT_ROLES[row.role];
    if (key && row.status === "SIGNED") signedAt[key] = parseSince(row.since);
  }
  return {
    postenStatus: change.status || "IN_PROGRESS",
    contractStatus,
    signerStatus: signerStatus.map((row) => ({
      role: row.role,
      order: row.order,
      status: row.status,
      since: row.since,
    })),
    ...signedAt,
  };
}

export function storedSignerStatus(signers) {
  return signers.map((signer) => ({
    role: signer.role,
    order: signer.order,
    status: "WAITING",
  }));
}
