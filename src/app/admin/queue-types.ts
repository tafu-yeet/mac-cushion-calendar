// Data passed from the queue page (server) to event cards (client).

export type QueueEvent = {
  id: number;
  postId: string;
  status: string;
  name: string;
  eventType: string;
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
