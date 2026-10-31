import { NextResponse, type NextRequest } from "next/server";
import { isAdminUser } from "@/lib/auth";
import { createSessionClient } from "@/lib/supabase/server";
import type { Division, Registration } from "@/lib/types";

const COLUMNS = [
  "confirmation_code",
  "division",
  "status",
  "player1_name",
  "player1_phone",
  "player1_email",
  "player2_name",
  "player2_phone",
  "player2_email",
  "team_name",
  "payment_ref",
  "source",
  "admin_notes",
  "created_at",
] as const;

function cell(v: unknown) {
  const s = v == null ? "" : String(v);
  // neutralise spreadsheet formula injection and quote everything
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replaceAll('"', '""')}"`;
}

export async function GET(request: NextRequest) {
  const sb = await createSessionClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!isAdminUser(user)) return NextResponse.json({ error: "Not authorised" }, { status: 401 });

  const divisionId = request.nextUrl.searchParams.get("division");
  let q = sb.from("registrations").select("*").order("created_at");
  if (divisionId) q = q.eq("division_id", divisionId);
  const [{ data: regs, error }, { data: divisions }] = await Promise.all([
    q.returns<Registration[]>(),
    sb.from("divisions").select("id, name").returns<Pick<Division, "id" | "name">[]>(),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const names = Object.fromEntries((divisions ?? []).map((d) => [d.id, d.name]));
  const lines = [
    COLUMNS.join(","),
    ...(regs ?? []).map((r) =>
      COLUMNS.map((c) => cell(c === "division" ? names[r.division_id] : r[c as keyof Registration])).join(","),
    ),
  ];
  return new NextResponse(`﻿${lines.join("\r\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="registrations-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
