// Data passed from the queue page (server) to event cards (client).

/** Two readings of one field, Rubric's and Instagram's, waiting for a person (worker/merge.py). */
export type Conflict = { field: string; rubric: string | boolean | null; instagram: string | boolean | null; why?: string };

export type QueueEvent = {
  id: number;
  postId: string | null; // null for an event only Rubric lists
  source: "instagram" | "rubric" | "both";
  flags: string[]; // instagram_post_deleted, rubric_missing, changed_on_instagram
  conflicts: Conflict[];
  ticketUrl: string | null; // the Rubric listing
  rubricImageUrl: string | null;
  description: string | null; // Rubric's, shown when there's no post
  status: string;
  name: string;
  eventType: string;
  category: string;
  cost: string; // "free" | "paid" | "unknown"
  price: string | null;
  tags: string[];
  hasFreeFood: boolean;
  foodDescription: string | null;
  startsAt: string | null;
  startTimeKnown: boolean;
  startDate: string; // campus-local "YYYY-MM-DD", "" when unknown
  startTime: string; // campus-local "HH:MM", "" when unknown
  endTime: string;
  location: string | null;
  hostedBy: string | null; // who runs it, when not the posting account
  openToAll: boolean;
  confidence: number | null;
  reason: string | null;
  reviewNotes: string[];
  model: string | null;
  autoApproved: boolean; // published by the worker without review
  clubId: number;
  clubName: string;
  clubUsername: string;
  caption: string;
  permalink: string | null;
  postedAt: string | null;
  imageUrl: string | null; // short-lived signed URL
};

export type QueueGroup = {
  key: string;
  events: QueueEvent[];
};
