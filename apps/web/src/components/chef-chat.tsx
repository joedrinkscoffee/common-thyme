"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChefAvatar } from "./chef-avatar";
import type { Brief, Segment } from "@/lib/chef/brief";
import type { ChefTurnResponse, HomeMessage } from "@/lib/chef/home";
import { checkInDinner } from "@/app/chef-actions";
import type { CheckInAction } from "@/lib/chef/check-in";

const STICKERS = ["bg-lemon", "bg-caper", "bg-kale"];
const LONG_EDGE = 1568;
/** The chat box grows with the text up to this height (about 7 lines), then scrolls. */
const INPUT_MAX_HEIGHT = 196;
const NOT_CONNECTED = "I'm not hooked up yet, so I can't act on that. Once the Anthropic key is in, I'll change the week right here.";

type Photo = { data: string; type: string; preview: string };

/** Shrinks a photo for Chef to read: long edge 1568px, JPEG. */
async function preparePhoto(file: File): Promise<Photo | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, LONG_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL("image/jpeg", 0.85);
    return { data: url.split(",")[1], type: "image/jpeg", preview: url };
  } catch {
    return null;
  }
}

function Paragraph({ segments }: { segments: Segment[] }) {
  let sticker = 0;
  return (
    <p className="m-0">
      {segments.map((s, i) => {
        if (typeof s === "string") return <span key={i}>{s}</span>;
        if ("bold" in s) return <strong key={i}>{s.bold}</strong>;
        return (
          <span key={i} className={`${STICKERS[sticker++ % STICKERS.length]} rounded-[5px] px-1.5 font-semibold`}>
            {s.sticker}
          </span>
        );
      })}
    </p>
  );
}

/** Chef's replies are plain text with an occasional **bold** dish name. */
function ChefText({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n{2,}/).map((para, i) => (
        <p key={i} className="m-0 [&+p]:mt-2">
          {para.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
            part.startsWith("**") && part.endsWith("**") ? <strong key={j}>{part.slice(2, -2)}</strong> : <span key={j}>{part}</span>,
          )}
        </p>
      ))}
    </>
  );
}

const chip =
  "min-h-9 rounded-full border-2 border-ink bg-paper px-3.5 text-sm font-semibold transition-colors hover:bg-lemon disabled:cursor-wait disabled:opacity-60";
const bigChip =
  "min-h-11 rounded-full border-2 border-ink bg-paper px-4 font-bold transition-colors hover:bg-lemon disabled:cursor-wait disabled:opacity-60";

/**
 * The Chef home's chat panel: Chef's note about the week, the household's
 * conversation with Chef, one check-in question at a time, suggested prompts
 * and a free-text box (with an optional photo).
 */
export function ChefChat({
  brief,
  initialMessages,
  connected,
  firstName,
  statusLabel,
  partnerSlot = null,
  sample = false,
}: {
  brief: Brief;
  initialMessages: HomeMessage[];
  connected: boolean;
  firstName: string | null;
  statusLabel: string;
  partnerSlot?: ReactNode;
  sample?: boolean;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkInBusy, startCheckIn] = useTransition();
  const [answeredCheckIn, setAnsweredCheckIn] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Grow the chat box to fit what's typed, up to INPUT_MAX_HEIGHT, then scroll inside it.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const height = Math.min(el.scrollHeight + 4, INPUT_MAX_HEIGHT); // + the 2px border on each side
    el.style.height = `${height}px`;
    el.style.overflowY = el.scrollHeight + 4 > INPUT_MAX_HEIGHT ? "auto" : "hidden";
  }, [draft]);

  // A refresh (after a check-in or a change) brings the saved conversation from the server.
  const [loaded, setLoaded] = useState(initialMessages);
  if (loaded !== initialMessages) {
    setLoaded(initialMessages);
    setMessages(initialMessages);
  }
  useEffect(() => {
    // The panel has a fixed height and the conversation scrolls inside it: keep the newest message in view.
    const el = log.current;
    if (el && (messages.length || thinking)) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, thinking]);

  const busy = thinking || checkInBusy;
  const last = messages.at(-1);
  const openChoice = !thinking && last?.role === "chef" ? last.choice : null;
  const checkIn = brief.checkIn && brief.checkIn.dinnerId !== answeredCheckIn && !openChoice ? brief.checkIn : null;

  const localId = useRef(0);
  const local = (role: "user" | "chef", body: string): HomeMessage => {
    localId.current += 1;
    return { id: `local-${localId.current}`, role, author: role === "user" ? firstName : null, body, choice: null, changes: [], at: "" };
  };

  async function send(text: string, withPhoto: Photo | null = photo) {
    const clean = text.trim();
    if ((!clean && !withPhoto) || busy) return;
    setError(null);
    setDraft("");
    setPhoto(null);
    const shown = withPhoto ? `${clean || "Here's a recipe."} (photo attached)` : clean;
    setMessages((m) => [...m, local("user", shown)]);
    if (!connected) {
      setMessages((m) => [...m, local("chef", sample ? "This is a sample week, so I can't make changes here. Sign in to talk to me for real." : NOT_CONNECTED)]);
      return;
    }
    setThinking(true);
    try {
      const res = await fetch("/api/chef", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: clean, image: withPhoto ? { data: withPhoto.data, type: withPhoto.type } : null }),
      });
      const result = (await res.json().catch(() => ({ ok: false, error: "Something went wrong. Try again?" }))) as ChefTurnResponse;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessages((m) => [...m, result.reply]);
      if (result.changed) router.refresh();
    } catch {
      setError("Couldn't reach Chef. Check your connection and try again?");
    } finally {
      setThinking(false);
    }
  }

  function answerCheckIn(action: CheckInAction | "undo", dinnerId: string | undefined = checkIn?.dinnerId) {
    if (!dinnerId) return;
    if (sample) {
      if (action !== "undo") setAnsweredCheckIn(dinnerId);
      return;
    }
    startCheckIn(async () => {
      const result = await checkInDinner(dinnerId, action);
      if (!result.ok) setError(result.error ?? "Couldn't save that.");
      else {
        setError(null);
        setAnsweredCheckIn(action === "undo" ? null : dinnerId);
      }
    });
  }

  return (
    <section
      aria-label="Chat with Chef"
      className="flex min-w-0 max-w-[720px] flex-[999_1_600px] flex-col overflow-hidden rounded-[28px] border-2 border-ink bg-paper h-[calc(100dvh-9.5rem)] min-h-[480px] sm:h-[calc(100dvh-7rem)] lg:sticky lg:top-4 lg:h-[calc(100dvh-6.5rem)]"
    >
      <header className="flex flex-none items-center gap-3 border-b-2 border-line px-5 py-4 sm:px-6">
        <ChefAvatar size={44} />
        <div>
          <div className="font-display text-xl font-extrabold leading-tight">Chef</div>
          <div className="text-[13px] text-muted">{statusLabel}</div>
        </div>
      </header>

      <div ref={log} role="log" aria-live="polite" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-3.5 text-[17px] leading-relaxed">
          {brief.paragraphs.map((p, i) => (
            <Paragraph key={i} segments={p} />
          ))}
          {partnerSlot}
        </div>

        {messages.map((m, i) => {
          if (m.role === "user") {
            const partner = m.author && firstName && m.author !== firstName;
            return (
              <div key={m.id} className="flex max-w-[85%] flex-col items-end self-end">
                {partner && <span className="mb-1 text-xs font-semibold text-muted">{m.author}</span>}
                <p className="m-0 whitespace-pre-wrap rounded-[18px] rounded-br-[4px] bg-ink px-4 py-2.5 text-cream">{m.body}</p>
              </div>
            );
          }
          const isLast = i === messages.length - 1;
          return (
            <div key={m.id} className="flex max-w-[92%] flex-col items-start gap-2 self-start">
              {(m.body || m.choice) && (
                <div className="rounded-[18px] rounded-bl-[4px] bg-sand px-4 py-3 leading-relaxed">
                  {m.body && <ChefText text={m.body} />}
                  {m.choice && (!m.body || !m.body.includes(m.choice.question)) && (
                    <p className={`m-0 font-display text-lg font-extrabold leading-tight ${m.body ? "mt-2" : ""}`}>{m.choice.question}</p>
                  )}
                  {m.choice && isLast && !thinking && (
                    <div role="group" aria-label={m.choice.question} className="mt-3 flex flex-wrap gap-2">
                      {m.choice.choices.map((c) => (
                        <button key={c} type="button" disabled={busy} onClick={() => void send(c, null)} className={bigChip}>
                          {c}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {m.changes.length > 0 && (
                <ul aria-label="What Chef changed" className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0">
                  {m.changes.map((c, j) => (
                    <li key={j} className="rounded-full border-[1.5px] border-ink bg-caper px-2.5 py-0.5 text-[12px] font-bold">
                      ✓ {c}
                    </li>
                  ))}
                  {m.undo && isLast && (
                    <li>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => answerCheckIn("undo", m.undo ?? undefined)}
                        className="rounded-full border-[1.5px] border-ink bg-paper px-2.5 py-0.5 text-[12px] font-bold transition-colors hover:bg-lemon disabled:opacity-60"
                      >
                        Undo
                      </button>
                    </li>
                  )}
                </ul>
              )}
            </div>
          );
        })}

        {checkIn && !thinking && (
          <div className="max-w-[92%] self-start rounded-[18px] rounded-bl-[4px] bg-sand px-4 py-3.5">
            <p className="m-0 font-display text-xl font-extrabold leading-tight">
              Did you make {checkIn.title} {checkIn.when}?
            </p>
            <p className="mb-0 mt-1 text-[15px] text-muted">
              {checkIn.waiting > 1 ? `${checkIn.waiting} meals this week still need a check-in. ` : ""}
              If not, I can move it while the fresh stuff is still good.
            </p>
            <div role="group" aria-label="Check in" className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => answerCheckIn("cooked")} className={bigChip}>
                We made it
              </button>
              {checkIn.later && (
                <button type="button" disabled={busy} onClick={() => answerCheckIn("later")} className={bigChip}>
                  Later this week
                </button>
              )}
              <button type="button" disabled={busy} onClick={() => answerCheckIn("next_week")} className={bigChip}>
                Next week
              </button>
              <button type="button" disabled={busy} onClick={() => answerCheckIn("skip")} className={bigChip}>
                Skip it
              </button>
            </div>
          </div>
        )}

        {thinking && (
          <p className="m-0 self-start rounded-[18px] rounded-bl-[4px] bg-sand px-4 py-2.5 text-muted" aria-label="Chef is thinking">
            <span className="inline-flex gap-1" aria-hidden="true">
              <span className="h-2 w-2 animate-bounce rounded-full bg-muted [animation-delay:-0.3s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-muted [animation-delay:-0.15s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-muted" />
            </span>
          </p>
        )}
        {error && (
          <p role="alert" className="m-0 max-w-[92%] self-start rounded-[18px] rounded-bl-[4px] border-2 border-tomato bg-paper px-4 py-2.5">
            {error}
          </p>
        )}
      </div>

      <footer className="flex-none border-t-2 border-line bg-cream/60 px-4 pb-4 pt-3 sm:px-5">
        {!openChoice && (
          <div className="mb-3 flex flex-wrap gap-2" aria-label="Suggestions">
            {brief.suggestions.map((s) => (
              <button
                key={s}
                type="button"
                disabled={busy}
                onClick={() => (s === "Add a recipe from a link" ? setDraft("Add this recipe: ") : void send(s, null))}
                className={chip}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {photo && (
          <div className="mb-2 flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- a local preview */}
            <img src={photo.preview} alt="Photo to send" className="h-14 w-14 rounded-lg border-2 border-ink object-cover" />
            <button type="button" onClick={() => setPhoto(null)} className="rounded-full px-2 py-1 text-sm font-semibold text-muted hover:bg-lemon hover:text-ink">
              Remove photo
            </button>
          </div>
        )}
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send(draft);
          }}
        >
          <button
            type="button"
            aria-label="Add a photo of a recipe"
            title="Add a photo of a recipe"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
            className="flex min-h-[52px] w-[52px] flex-none items-center justify-center rounded-full border-2 border-ink bg-paper transition-colors hover:bg-lemon disabled:opacity-60"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              const prepared = await preparePhoto(file);
              if (prepared) setPhoto(prepared);
              else setError("Couldn't read that photo. Try a JPEG or PNG?");
            }}
          />
          <label htmlFor="chef-input" className="sr-only">
            Tell Chef what&apos;s going on
          </label>
          <textarea
            ref={inputRef}
            id="chef-input"
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter starts a new line. Leave Enter alone while an IME is composing.
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            enterKeyHint="send"
            placeholder={photo ? "What's this? (optional)" : "Tell Chef what's going on this week…"}
            maxLength={4000}
            style={{ maxHeight: INPUT_MAX_HEIGHT }}
            className="block min-h-[52px] min-w-0 flex-1 resize-none overflow-y-hidden rounded-[26px] border-2 border-ink bg-paper px-5 py-3 text-base leading-6"
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={busy}
            className="flex min-h-[52px] w-[52px] flex-none items-center justify-center rounded-full bg-tomato text-white transition-colors hover:bg-tomato-dark disabled:opacity-60"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 10h11M11 5l5 5-5 5" />
            </svg>
          </button>
        </form>
      </footer>
    </section>
  );
}
