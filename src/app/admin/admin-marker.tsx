"use client";

import { useEffect } from "react";

import { markAdminBrowser } from "@/lib/visitor";

/** Marks this browser as the admin's, so their own browsing of the public site isn't counted in Stats. */
export function AdminMarker() {
  useEffect(markAdminBrowser, []);
  return null;
}
