"use server";

import { refresh, updateTag } from "next/cache";

import { requireAdmin } from "@/lib/auth";
import { EVENTS_TAG } from "@/lib/events";

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

/**
 * A person's answer on how a Rubric club maps to ours (worker/rubric.py keeps it):
 * "yes" confirms the suggested club, "no" says it isn't one of ours, and a
 * username links it to that club instead.
 */
export async function decideClubLink(formData: FormData): Promise<void> {
  const { supabase } = await requireAdmin();
  const societyId = Number(formData.get("society_id"));
  const decision = String(formData.get("decision") ?? "");
  if (!Number.isInteger(societyId)) return;
  if (decision === "yes") {
    await supabase.from("rubric_societies").update({ match_method: "person", match_status: "confirmed" }).eq("society_id", societyId);
  } else if (decision === "no") {
    await supabase
      .from("rubric_societies")
      .update({ match_method: "person", match_status: "rejected", club_id: null })
      .eq("society_id", societyId);
  } else if (decision === "other") {
    const username = normalizeUsername(String(formData.get("username") ?? ""));
    const { data: club } = await supabase.from("clubs").select("id").eq("instagram_username", username).maybeSingle();
    if (!club) return;
    await supabase
      .from("rubric_societies")
      .update({ match_method: "person", match_status: "confirmed", club_id: club.id, match_score: 1 })
      .eq("society_id", societyId);
  }
  refresh();
}

/** Deletes the club and, through the foreign keys, its posts and events. */
export async function deleteClub(id: number) {
  const { supabase } = await requireAdmin();
  await supabase.from("clubs").delete().eq("id", id);
  updateTag(EVENTS_TAG); // its events disappear from the public pages too
  refresh();
}
