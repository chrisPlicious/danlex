"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/components/action-form";
import { adminClient, isAdminUser } from "@/lib/auth";
import { createSessionClient } from "@/lib/supabase/server";

const fail = (error: string): ActionState => ({ ok: false, error });
const done = (message: string): ActionState => ({ ok: true, message });

function issues(e: z.ZodError) {
  return e.issues.map((i) => `${String(i.path[0] ?? "")}: ${i.message}`).join(" · ");
}

function revalidateAll() {
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------------------
// auth
// ---------------------------------------------------------------------------

export async function signIn(_: ActionState, fd: FormData): Promise<ActionState> {
  const password = String(fd.get("password") ?? "");
  if (!password) return fail("Enter the admin password.");

  // There is one admin account, so its email comes from server config rather than the form.
  // Database rules still rely on this being a real Supabase session.
  const email = process.env.ADMIN_EMAIL;
  if (!email) return fail("Admin sign-in isn't set up. Set ADMIN_EMAIL on the server.");

  const sb = await createSessionClient();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error?.status === 429) return fail("Too many tries. Wait a few minutes, then try again.");
  if (error || !isAdminUser(data.user)) {
    await sb.auth.signOut();
    return fail("Wrong password.");
  }
  redirect("/admin");
}

export async function signOut() {
  const sb = await createSessionClient();
  await sb.auth.signOut();
  redirect("/admin/login");
}

// ---------------------------------------------------------------------------
// tournament
// ---------------------------------------------------------------------------

const TournamentInput = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{2,60}$/, "use lowercase letters, numbers and dashes"),
  event_date: z.iso.date().optional().or(z.literal("").transform(() => undefined)),
  venue: z.string().trim().max(160).optional(),
  description: z.string().trim().max(2000).optional(),
  currency: z.string().trim().toUpperCase().length(3),
  payment_instructions: z.string().trim().max(600).optional(),
  status: z.enum(["draft", "open", "closed", "in_progress", "completed"]),
});

export async function saveTournament(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = TournamentInput.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail(issues(parsed.error));
  const { id, ...v } = parsed.data;
  const row = {
    ...v,
    event_date: v.event_date ?? null,
    venue: v.venue || null,
    description: v.description || null,
    payment_instructions: v.payment_instructions || null,
  };

  const sb = await adminClient();
  const { error } = id
    ? await sb.from("tournaments").update(row).eq("id", id)
    : await sb.from("tournaments").insert(row);
  if (error) return fail(error.code === "23505" ? "That slug is already used." : error.message);
  revalidateAll();
  return done(id ? "Tournament saved." : "Tournament created.");
}

const QR_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export async function uploadQr(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = z.uuid().safeParse(fd.get("tournament_id"));
  const file = fd.get("qr");
  if (!id.success) return fail("Invalid tournament");
  if (!(file instanceof File) || file.size === 0) return fail("Choose a QR image.");
  const ext = QR_TYPES[file.type];
  if (!ext) return fail("QR must be PNG, JPG or WebP.");
  if (file.size > 3 * 1024 * 1024) return fail("QR image must be under 3 MB.");

  const sb = await adminClient();
  const { data: t } = await sb.from("tournaments").select("payment_qr_path").eq("id", id.data).single();
  const path = `qr/${id.data}-${Date.now()}.${ext}`;
  const { error } = await sb.storage.from("public-assets").upload(path, file, { contentType: file.type });
  if (error) return fail(error.message);

  const { error: uErr } = await sb.from("tournaments").update({ payment_qr_path: path }).eq("id", id.data);
  if (uErr) return fail(uErr.message);
  if (t?.payment_qr_path) await sb.storage.from("public-assets").remove([t.payment_qr_path]);
  revalidateAll();
  return done("Payment QR updated.");
}

export async function removeQr(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = z.uuid().safeParse(fd.get("tournament_id"));
  if (!id.success) return fail("Invalid tournament");
  const sb = await adminClient();
  const { data: t } = await sb.from("tournaments").select("payment_qr_path").eq("id", id.data).single();
  await sb.from("tournaments").update({ payment_qr_path: null }).eq("id", id.data);
  if (t?.payment_qr_path) await sb.storage.from("public-assets").remove([t.payment_qr_path]);
  revalidateAll();
  return done("QR removed — the placeholder is shown again.");
}

// ---------------------------------------------------------------------------
// divisions
// ---------------------------------------------------------------------------

const DivisionInput = z.object({
  id: z.uuid().optional(),
  tournament_id: z.uuid(),
  kind: z.enum(["singles", "doubles"]),
  name: z.string().trim().min(2).max(60),
  fee: z.coerce.number().min(0).max(1_000_000),
  sort_order: z.coerce.number().int().min(0).max(99).default(0),
  registration_open: z.literal("on").optional(),
  grand_final_reset: z.literal("on").optional(),
  games_to_win: z.coerce.number().int().min(1).max(3),
  points_to: z.coerce.number().int().min(5).max(25),
  win_by: z.coerce.number().int().min(1).max(2),
});

export async function saveDivision(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = DivisionInput.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail(issues(parsed.error));
  const { id, games_to_win, points_to, win_by, registration_open, grand_final_reset, ...v } = parsed.data;
  const row = {
    ...v,
    registration_open: registration_open === "on",
    grand_final_reset: grand_final_reset === "on",
    match_format: { games_to_win, points_to, win_by },
  };

  const sb = await adminClient();
  const { error } = id
    ? await sb.from("divisions").update(row).eq("id", id)
    : await sb.from("divisions").insert(row);
  if (error) {
    if (error.code === "23505") return fail("A division with that name already exists.");
    return fail(error.message);
  }
  revalidateAll();
  return done(id ? "Division saved." : "Division added.");
}

export async function deleteDivision(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = z.uuid().safeParse(fd.get("id"));
  if (!id.success) return fail("Invalid division");
  const sb = await adminClient();
  const { count } = await sb
    .from("registrations")
    .select("id", { count: "exact", head: true })
    .eq("division_id", id.data);
  if (count) return fail(`This division has ${count} registration(s). Remove them first.`);
  const { error } = await sb.from("divisions").delete().eq("id", id.data);
  if (error) return fail(error.message);
  revalidateAll();
  return done("Division deleted.");
}
