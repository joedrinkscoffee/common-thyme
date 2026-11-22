import { describe, expect, it } from "vitest";
import { signCheckIn, verifyCheckIn } from "./check-in-link";

describe("check-in links", () => {
  const claim = { dinnerId: "d1", userId: "u1", action: "cooked" as const };
  it("round-trips and rejects tampering, the wrong secret and expiry", () => {
    const now = 1_800_000_000_000;
    const t = signCheckIn(claim, "s3cret", now);
    expect(verifyCheckIn(t, "s3cret", now)).toMatchObject(claim);
    expect(verifyCheckIn(t, "other", now)).toBeNull();
    const [body, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), d: "d2" })).toString("base64url");
    expect(verifyCheckIn(`${forged}.${sig}`, "s3cret", now)).toBeNull();
    expect(verifyCheckIn(t, "s3cret", now + 15 * 86_400_000)).toBeNull();
    expect(verifyCheckIn("junk", "s3cret", now)).toBeNull();
  });
});
