export interface ConfirmationDetails {
  code: string;
  playerName: string;
  divisionName: string;
  tournamentName: string;
  eventDate: string | null;
  venue: string | null;
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export function confirmationEmail(d: ConfirmationDetails) {
  const rows: [string, string][] = [
    ["Tournament", d.tournamentName],
    ["Division", d.divisionName],
  ];
  if (d.eventDate) rows.push(["Date", d.eventDate]);
  if (d.venue) rows.push(["Venue", d.venue]);

  const text = [
    `Hi ${d.playerName},`,
    "",
    "You're in! Your entry is confirmed.",
    "",
    `Confirmation code: ${d.code}`,
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    "Show this code at check-in. See you on court.",
    "",
    "Danlex Pickle Court",
  ].join("\n");

  const rowsHtml = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:4px 16px 4px 0;color:#3d5c50">${label}</td><td style="padding:4px 0;font-weight:bold">${escapeHtml(value)}</td></tr>`,
    )
    .join("");

  const html = `<div style="background:#fbf3de;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#0d3b2e">
  <div style="max-width:480px;margin:0 auto;background:#fffdf6;border-top:10px solid #ffc21a;border-radius:6px;padding:24px">
    <h1 style="margin:0 0 8px;font-size:28px">You're in!</h1>
    <p style="margin:0 0 20px">Hi ${escapeHtml(d.playerName)}, your entry is confirmed.</p>
    <p style="margin:0;font-size:13px;font-weight:bold">Confirmation code</p>
    <p style="margin:4px 0 20px;font-size:30px;font-weight:bold;letter-spacing:1px">${escapeHtml(d.code)}</p>
    <table style="border-collapse:collapse;font-size:14px;margin:0 0 20px">${rowsHtml}</table>
    <p style="margin:0">Show this code at check-in. See you on court.</p>
    <p style="margin:20px 0 0;font-size:13px;color:#3d5c50">Danlex Pickle Court</p>
  </div>
</div>`;

  return { subject: `You're in: ${d.tournamentName}, ${d.divisionName}`, text, html };
}
