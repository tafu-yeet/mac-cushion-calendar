"use server";

import { refresh } from "next/cache";

import { requireAdmin } from "@/lib/auth";

export type AddClubState = { error: string } | { added: string } | null;

const USERNAME = /^[a-z0-9._]{1,30}$/;

/** Accepts "name", "@name", or an instagram.com profile link. */
function normalizeUsername(raw: string): string {
  const value = raw.trim();
  const fromUrl = value.match(/instagram\.com\/([^/?#]+)/i);
  return (fromUrl ? fromUrl[1] : value).replace(/^@/, "").toLowerCase();
}

export async function addClub(_prev: AddClubState, formData: FormData): Promise<AddClubState> {
  const { supabase } = await requireAdmin();
  const username = normalizeUsername(String(formData.get("username") ?? ""));
  const name = String(formData.get("name") ?? "").trim();
  const hours = Number(formData.get("poll_hours") ?? 12);

  if (!USERNAME.test(username)) return { error: "That doesn't look like an Instagram username." };
  if (!name) return { error: "Add the club's name." };
  if (!Number.isFinite(hours) || hours < 1 || hours > 168) return { error: "Check every 1 to 168 hours." };

  const { error } = await supabase
    .from("clubs")
    .insert({ instagram_username: username, name, active: true, poll_interval_minutes: Math.round(hours * 60) });
  if (error) {
    return { error: error.code === "23505" ? `@${username} is already in the list.` : error.message };
  }
  refresh();
  return { added: username };
}

export async function setClubActive(id: number, active: boolean) {
  const { supabase } = await requireAdmin();
  await supabase.from("clubs").update({ active }).eq("id", id);
  refresh();
}

/** Deletes the club and, through the foreign keys, its posts and events. */
export async function deleteClub(id: number) {
  const { supabase } = await requireAdmin();
  await supabase.from("clubs").delete().eq("id", id);
  refresh();
}
