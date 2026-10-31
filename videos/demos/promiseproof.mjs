// PromiseProof demo take: ask the agent in plain English → live research →
// verdict with verified quotes → screenshot read on-device by GenieX.
import { resolve } from "node:path";

export const url = "http://localhost:3000/";

const SCREENSHOT = resolve("test-results/screenshots/booking-paris-live-2026-10-31.jpg");
const QUERY = "I'm booking Delta Basic Economy. Their site says no change fees. If I cancel 3 days later, can I get a full cash refund?";

// Presentation only: hide the Next.js dev-tools bubble.
export const css = `nextjs-portal{display:none!important}`;

export async function ready(t) {
  await t.frame.getByRole("button", { name: "Investigate" }).waitFor();
  await t.page.waitForTimeout(1200);
}

export async function still(t) {
  await t.frame.locator("textarea").fill(QUERY);
}

export default async function take(t) {
  const f = t.frame;
  await t.hold(900); // hero

  // Bring the form into view and ask in plain English.
  await t.moveTo(t.width * 0.5, t.height * 0.55, { ms: 600 });
  await t.wheel(330, { ms: 700 });
  await t.clickOn(f.locator("textarea"), { fx: 0.3, fy: 0.4 });
  await t.type(QUERY);
  await t.hold(400);
  await t.clickOn(f.getByRole("button", { name: "Investigate" }), { settle: 300 });

  // Agent activity streams in under the form.
  await t.moveTo(t.width * 0.78, t.height * 0.45, { ms: 500 });
  await t.wheel(380, { ms: 700 });
  await t.until(() => f.getByRole("heading", { name: "Source excerpts" }).isVisible(), { label: "Live research · sped up" });

  // Verdict.
  await t.hold(400);
  const badge = f.locator("#report span.rounded-full").first();
  await t.hover(badge, { dwell: 500 });
  t.poster();
  await t.hold(1600);

  // Promise vs fine print, conditions, verified quotes.
  await t.moveTo(t.width * 0.5, t.height * 0.6, { ms: 500 });
  await t.wheel(420, { ms: 900 });
  await t.hold(1800);
  await t.wheel(520, { ms: 900 });
  await t.hold(1200);
  await t.wheel(Math.round(t.height * 0.55), { ms: 900 });
  await t.hover(f.locator("#report blockquote").first(), { fx: 0.2, dwell: 1800 });

  // Back to the form: read a real Booking.com screenshot on-device with GenieX.
  await t.wheel(-6000, { ms: 1200 });
  await t.wheel(330, { ms: 500 });
  t.page.once("filechooser", (fc) => fc.setFiles(SCREENSHOT));
  await t.clickOn(f.getByText("Attach screenshot"), { settle: 300 });
  await t.until(
    async () => (await f.locator("textarea").inputValue()).includes("Booking.com") && !(await f.getByText("Reading on-device").isVisible()),
    { label: "GenieX on-device · sped up" },
  );
  await t.hover(f.getByText(/Read on-device by/), { fx: 0.3, dwell: 2200 });

  await t.moveTo(t.width * 0.62, t.height * 0.42, { ms: 700 });
  await t.hold(900);
}
