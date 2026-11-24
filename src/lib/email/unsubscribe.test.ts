import { describe, expect, it, vi } from "vitest";

import { listUnsubscribeHeaders, parseUnsubscribe, unsubscribeUrl } from "@/lib/email/unsubscribe";
import { unsubscribe } from "@/lib/email/unsubscribe-action";

const SITE = "https://www.maccushion.ca";
const TOKEN = "3f1b2c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d";

describe("unsubscribe links", () => {
  it("puts the token and the choice in the footer link", () => {
    const url = new URL(unsubscribeUrl(SITE, TOKEN, "digest"));
    expect(url.pathname).toBe("/unsubscribe");
    expect(parseUnsubscribe(url.searchParams)).toEqual({ token: TOKEN, choice: "digest" });
  });

  it("adds one-click List-Unsubscribe headers to every email", () => {
    const headers = listUnsubscribeHeaders(SITE, TOKEN, "club_posts");
    expect(headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(headers["List-Unsubscribe"]).toBe(`<${SITE}/unsubscribe/one-click?t=${TOKEN}&c=club_posts>`);
  });

  it("rejects missing or malformed tokens and unknown choices", () => {
    expect(parseUnsubscribe(new URLSearchParams(""))).toBeNull();
    expect(parseUnsubscribe(new URLSearchParams("t=not-a-token&c=digest"))).toBeNull();
    expect(parseUnsubscribe(new URLSearchParams(`t=${TOKEN}&c=everything`))).toBeNull();
  });

  it("means every email when no choice is given", () => {
    expect(parseUnsubscribe({ t: TOKEN })).toEqual({ token: TOKEN, choice: "all" });
  });
});

describe("unsubscribe", () => {
  it("asks the database to turn the email off and says it worked", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    await expect(unsubscribe({ rpc } as never, TOKEN, "digest", "unsubscribe_link")).resolves.toBe("done");
    expect(rpc).toHaveBeenCalledWith("unsubscribe", { token: TOKEN, choice: "digest", how: "unsubscribe_link" });
  });

  it("says so when the link matches no member", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
    await expect(unsubscribe({ rpc } as never, TOKEN, "all", "list_unsubscribe")).resolves.toBe("unknown");
  });

  it("reports a database error instead of claiming success", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "down" } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(unsubscribe({ rpc } as never, TOKEN, "all", "unsubscribe_link")).resolves.toBe("error");
  });
});
