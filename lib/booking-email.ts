export interface BookingEmailDetails {
  code: string;
  name: string;
  playType: string;
  when: string;
  amount: string;
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Court booking confirmation, styled like the tournament one (cream ticket, ball-yellow top). */
export function bookingEmail(d: BookingEmailDetails) {
  const rows: [string, string][] = [
    ["Play type", d.playType],
    ["When", d.when],
    ["Paid", d.amount],
  ];

  const text = [
    `Hi ${d.name},`,
    "",
    "You're booked! Your court time is confirmed.",
    "",
    `Booking code: ${d.code}`,
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    "Show this code at the court. See you there.",
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
  <div style="max-width:480px;margin:0 auto;background:#fffdf6;border-top:10px solid #ff6b1a;border-radius:6px;padding:24px">
    <h1 style="margin:0 0 8px;font-size:28px">You're booked!</h1>
    <p style="margin:0 0 20px">Hi ${escapeHtml(d.name)}, your court time is confirmed.</p>
    <p style="margin:0;font-size:13px;font-weight:bold">Booking code</p>
    <p style="margin:4px 0 20px;font-size:30px;font-weight:bold;letter-spacing:1px">${escapeHtml(d.code)}</p>
    <table style="border-collapse:collapse;font-size:14px;margin:0 0 20px">${rowsHtml}</table>
    <p style="margin:0">Show this code at the court. See you there.</p>
    <p style="margin:20px 0 0;font-size:13px;color:#3d5c50">Danlex Pickle Court</p>
  </div>
</div>`;

  return { subject: `You're booked: ${d.playType}, ${d.when}`, text, html };
}
