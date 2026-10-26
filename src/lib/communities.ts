// The communities events can be for (campus.config.json "communities"), for the /communities page.

import { campus } from "@/lib/campus";

export type Community = { key: string; label: string; group: string };

export const COMMUNITIES: Community[] = campus.communities.map(({ key, label, group }) => ({ key, label, group }));

/** The communities in their groups, in order: Identity, Faith, Culture & heritage, Program. */
export const COMMUNITY_GROUPS: { group: string; communities: Community[] }[] = [...new Set(COMMUNITIES.map((c) => c.group))].map(
  (group) => ({ group, communities: COMMUNITIES.filter((c) => c.group === group) }),
);

export const communityOf = (key: string | undefined) => COMMUNITIES.find((c) => c.key === key) ?? null;
