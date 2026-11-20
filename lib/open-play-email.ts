// Open play emails, styled like the booking ones (cream ticket, flame top). Pure so they can be tested.

export type OpenPlayEmailKind = "confirmed" | "waitlisted" | "offered" | "late" | "cancelled";

export interface OpenPlayEmailDetails {
  kind: OpenPlayEmailKind;
  name: string;
  code: string;
  session: string;
  when: string;
  amount: string;
  /** Signup page; for "offered" it carries the payment link token. */
  url: string;
  /** "offered": when the offer runs out, court time. */
  payBy?: string;
  /** "cancelled": whether they had paid. */
  refund?: boolean;
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

function copy(d: OpenPlayEmailDetails): { subject: string; heading: string; lines: string[]; button?: string } {
  switch (d.kind) {
    case "confirmed":
      return {
        subject: `You're in: ${d.session}, ${d.when}`,
        heading: "You're in!",
        lines: ["Your spot is confirmed. Check in at the court with your code and we'll put you in the game queue."],
        button: "View your spot",
      };
    case "waitlisted":
      return {
        subject: `Waitlisted: ${d.session}, ${d.when}`,
        heading: "You're on the waitlist",
        lines: [
          "The session is full right now. If a spot opens, we'll email you a link to pay and claim it.",
          "Nothing to pay yet.",
        ],
        button: "Check your place",
      };
    case "offered":
      return {
        subject: `A spot opened: ${d.session}, ${d.when}`,
        heading: "A spot opened for you",
        lines: [
          `It's held for you until ${d.payBy ?? "shortly before the session"}. Pay by QR and upload your receipt to claim it.`,
          "If you can't make it, just let it lapse and it goes to the next player.",
        ],
        button: "Pay and claim my spot",
      };
    case "late":
      return {
        subject: `Payment received: ${d.session}, ${d.when}`,
        heading: "Payment received",
        lines: [
          "Your payment came in after your spot was gone, so you're not in this session.",
          "We've kept your receipt. The organisers will contact you about a refund.",
        ],
        button: "View details",
      };
    case "cancelled":
      return {
        subject: `Cancelled: ${d.session}, ${d.when}`,
        heading: "Session cancelled",
        lines: [
          "Sorry, the organisers had to cancel this session.",
          d.refund ? "You'll be refunded. The organisers will contact you." : "You hadn't paid, so there's nothing to refund.",
        ],
      };
  }
}

export function openPlayEmail(d: OpenPlayEmailDetails) {
  const c = copy(d);
  const rows: [string, string][] = [
    ["Session", d.session],
    ["When", d.when],
    [d.kind === "confirmed" ? "Paid" : "Fee", d.amount],
  ];

  const text = [
    `Hi ${d.name},`,
    "",
    c.heading,
    ...c.lines,
    "",
    `Your code: ${d.code}`,
    ...rows.map(([label, value]) => `${label}: ${value}`),
    ...(c.button ? ["", `${c.button}: ${d.url}`] : []),
    "",
    "Danlex Pickle Court",
  ].join("\n");

  const rowsHtml = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:4px 16px 4px 0;color:#3d5c50">${label}</td><td style="padding:4px 0;font-weight:bold">${escapeHtml(value)}</td></tr>`,
    )
    .join("");
  const linesHtml = c.lines.map((l) => `<p style="margin:0 0 12px">${escapeHtml(l)}</p>`).join("");
  const buttonHtml = c.button
    ? `<p style="margin:8px 0 20px"><a href="${escapeHtml(d.url)}" style="display:inline-block;background:#0d3b2e;color:#fff3d6;padding:12px 20px;border-radius:8px;font-weight:bold;text-decoration:none">${escapeHtml(c.button)}</a></p>`
    : "";

  const html = `<div style="background:#fbf3de;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#0d3b2e">
  <div style="max-width:480px;margin:0 auto;background:#fffdf6;border-top:10px solid #ff6b1a;border-radius:6px;padding:24px">
    <h1 style="margin:0 0 8px;font-size:28px">${escapeHtml(c.heading)}</h1>
    <p style="margin:0 0 12px">Hi ${escapeHtml(d.name)},</p>
    ${linesHtml}
    <p style="margin:8px 0 0;font-size:13px;font-weight:bold">Your code</p>
    <p style="margin:4px 0 20px;font-size:30px;font-weight:bold;letter-spacing:1px">${escapeHtml(d.code)}</p>
    <table style="border-collapse:collapse;font-size:14px;margin:0 0 20px">${rowsHtml}</table>
    ${buttonHtml}
    <p style="margin:20px 0 0;font-size:13px;color:#3d5c50">Danlex Pickle Court</p>
  </div>
</div>`;

  return { subject: c.subject, text, html };
}
