/**
 * The GAME PROFILE: what Marketing Studio knows about one game, kept apart from the website/SaaS Business Truth. Everything the owner can say about the game (genre, objective, what makes it
 * fun, mechanics, characters, controls, orientation, voice and energy) is stored here and may override the creative defaults. What can be VERIFIED (the store destination, the name, the
 * platforms of a verified listing, the gameplay actually captured) is derived from Product Truth and the capture library and never taken from this form. Pure validation is exported for tests.
 */
import type { StudioDb } from "../../db";
import { getSetting, setSetting } from "../../runtime";
import { audit } from "../../audit";
import { GAME_FORMATS, type GameFormat } from "./engine";

export const GAME_PLATFORMS = ["android", "ios", "web", "pc", "other"] as const;
export type GamePlatform = (typeof GAME_PLATFORMS)[number];
export const ENERGIES = ["relaxed", "fun", "energetic", "very_energetic"] as const;
export type Energy = (typeof ENERGIES)[number];
export const ENERGY_LABEL: Record<Energy, string> = { relaxed: "Relaxed", fun: "Fun", energetic: "Energetic", very_energetic: "Very energetic" };
export const ORIENTATIONS = ["portrait", "landscape", "adaptive"] as const;
export type Orientation = (typeof ORIENTATIONS)[number];

export type GameProfile = {
  platforms: GamePlatform[];
  /** a tester or live web build, where there is one */
  testerUrl: string;
  storeListings: string[];
  orientation: Orientation;
  /** how the player controls it, in plain words: "swipe to cut a line" */
  controls: string;
  genre: string;
  /** the basic objective as a short clause the narration can use: "fill the board by cutting it into pieces" */
  objective: string;
  /** what makes it fun, as a short clause: "every cut reshapes the whole board" */
  funFactor: string;
  mechanics: string[];
  characters: string[];
  progression: string;
  levelsModes: string;
  visualStyle: string;
  audience: string;
  /** preferred length in seconds, or null for the format's own length */
  preferredSeconds: number | null;
  /** "auto" picks a voice that suits this game; otherwise a voice id */
  voice: string;
  energy: Energy;
  /** keep the game's own sound effects and music in the mix when the capture has them */
  keepGameAudio: boolean;
  /** narration by default; false makes captions-and-game-audio videos */
  narrationDefault: boolean;
  /** formats the owner prefers; empty means every format the game supports */
  preferredFormats: GameFormat[];
  /** where the call to action goes when it is not the verified store listing */
  ctaDestination: string;
};

export const DEFAULT_GAME_PROFILE: GameProfile = {
  platforms: [],
  testerUrl: "",
  storeListings: [],
  orientation: "adaptive",
  controls: "",
  genre: "",
  objective: "",
  funFactor: "",
  mechanics: [],
  characters: [],
  progression: "",
  levelsModes: "",
  visualStyle: "",
  audience: "",
  preferredSeconds: null,
  voice: "auto",
  energy: "energetic",
  keepGameAudio: true,
  narrationDefault: true,
  preferredFormats: [],
  ctaDestination: "",
};

export const gameProfileKey = (productId: string) => `game_profile_${productId}`;

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const list = (v: unknown, n: number, max: number): string[] => {
  const raw = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[\n,;]+/) : [];
  return [...new Set(raw.map((x) => clean(x, max)).filter(Boolean))].slice(0, n);
};
const httpUrl = (v: unknown) => {
  const t = clean(v, 300);
  if (!t) return "";
  try {
    const u = new URL(t);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : "";
  } catch {
    return "";
  }
};

/** Pure: a partial profile from a form or a stored value, cleaned. Unknown enum values are refused rather than replaced. */
export function validateGameProfile(input: Partial<Record<keyof GameProfile, unknown>>, base: GameProfile = DEFAULT_GAME_PROFILE): { ok: true; value: GameProfile } | { ok: false; error: string } {
  const has = (k: keyof GameProfile) => input[k] !== undefined;
  const v: GameProfile = { ...base };
  if (has("platforms")) {
    const p = list(input.platforms, 5, 10).map((x) => x.toLowerCase());
    const bad = p.find((x) => !(GAME_PLATFORMS as readonly string[]).includes(x));
    if (bad) return { ok: false, error: `"${bad}" is not a platform (Android, iOS, Web, PC or other)` };
    v.platforms = p as GamePlatform[];
  }
  if (has("orientation")) {
    const o = clean(input.orientation, 12);
    if (!(ORIENTATIONS as readonly string[]).includes(o)) return { ok: false, error: "orientation must be portrait, landscape or adaptive" };
    v.orientation = o as Orientation;
  }
  if (has("energy")) {
    const e = clean(input.energy, 16);
    if (!(ENERGIES as readonly string[]).includes(e)) return { ok: false, error: "energy must be relaxed, fun, energetic or very energetic" };
    v.energy = e as Energy;
  }
  if (has("preferredFormats")) {
    const f = list(input.preferredFormats, 12, 30);
    const bad = f.find((x) => !(x in GAME_FORMATS));
    if (bad) return { ok: false, error: `"${bad}" is not a game video format` };
    v.preferredFormats = f as GameFormat[];
  }
  if (has("preferredSeconds")) {
    const raw = input.preferredSeconds;
    if (raw === null || raw === "" || raw === 0) v.preferredSeconds = null;
    else {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 8 || n > 60) return { ok: false, error: "preferred length must be between 8 and 60 seconds" };
      v.preferredSeconds = Math.round(n);
    }
  }
  if (has("voice")) v.voice = clean(input.voice, 30) || "auto";
  if (has("testerUrl")) v.testerUrl = httpUrl(input.testerUrl);
  if (has("ctaDestination")) v.ctaDestination = httpUrl(input.ctaDestination);
  if (has("storeListings")) v.storeListings = list(input.storeListings, 6, 300).map(httpUrl).filter(Boolean);
  for (const k of ["controls", "genre", "objective", "funFactor", "progression", "levelsModes", "visualStyle", "audience"] as const) if (has(k)) v[k] = clean(input[k], k === "genre" ? 60 : 200);
  if (has("mechanics")) v.mechanics = list(input.mechanics, 8, 60);
  if (has("characters")) v.characters = list(input.characters, 8, 60);
  if (has("keepGameAudio")) v.keepGameAudio = input.keepGameAudio === true || input.keepGameAudio === "on" || input.keepGameAudio === "true";
  if (has("narrationDefault")) v.narrationDefault = input.narrationDefault === true || input.narrationDefault === "on" || input.narrationDefault === "true";
  return { ok: true, value: v };
}

export async function getGameProfile(db: StudioDb, productId: string): Promise<GameProfile> {
  const stored = await getSetting<Partial<GameProfile> | null>(gameProfileKey(productId), null, db);
  const r = validateGameProfile((stored ?? {}) as never);
  return r.ok ? r.value : DEFAULT_GAME_PROFILE;
}

export async function saveGameProfile(db: StudioDb, actor: string, productId: string, patch: Partial<Record<keyof GameProfile, unknown>>): Promise<GameProfile> {
  const cur = await getGameProfile(db, productId);
  const r = validateGameProfile(patch, cur);
  if (!r.ok) throw new Error(r.error);
  await setSetting(gameProfileKey(productId), r.value, actor, db, { audited: false });
  await audit(db, { actor, action: "game_profile.save", entity: "product", entityId: productId, productId, detail: { fields: Object.keys(patch).slice(0, 30) } });
  return r.value;
}

/** A game counts as a mobile game (the store-listing rule applies) when its profile lists Android or iOS. */
export async function isMobileGame(db: StudioDb, productId: string): Promise<boolean> {
  const p = await getGameProfile(db, productId);
  return p.platforms.includes("android") || p.platforms.includes("ios");
}

/** Pure: what the setup still needs before the game planner can write about the game. Nothing is invented for a missing field. */
export function profileGaps(p: GameProfile): string[] {
  const gaps: string[] = [];
  if (p.objective.length < 8) gaps.push("the basic objective (what the player is trying to do)");
  if (p.funFactor.length < 8) gaps.push("what makes it fun");
  if (!p.mechanics.length) gaps.push("the major mechanics");
  if (!p.controls) gaps.push("the controls");
  return gaps;
}

/**
 * The owner's known games, classified by themselves (owner products only: an outside customer's product is never classified for them, it must be chosen). Each entry seeds the profile with
 * what is true of the game from its own capture and Product Truth; anything the owner has already filled in is left alone.
 */
export const KNOWN_OWNED_GAMES: Record<string, Partial<Record<keyof GameProfile, unknown>>> = {
  scribblezap: {
    platforms: ["android", "web"],
    orientation: "portrait",
    controls: "hold and drag a finger to draw a cut across the page",
    genre: "puzzle",
    objective: "fill the page to hit the target",
    funFactor: "every cut changes the whole page",
    mechanics: ["drawing cuts", "dodging the bouncing balls", "daily challenge", "endless run"],
    levelsModes: "numbered levels, a Daily Challenge and Endless Run",
    visualStyle: "bright, doodle-style page",
    audience: "players who like quick, satisfying puzzles",
    energy: "energetic",
    narrationDefault: true,
  },
  mibblemeadow: {
    platforms: ["android"],
    orientation: "portrait",
    controls: "tap to mark, double-tap to place an animal",
    genre: "puzzle",
    objective: "find a home for every animal so that no two touch",
    funFactor: "the meadow cheers when the last animal clicks into place",
    mechanics: ["placing animals", "marking squares", "daily meadow"],
    characters: ["the Mibble animals"],
    levelsModes: "numbered meadows and a Daily Meadow",
    visualStyle: "cute, cozy meadow",
    audience: "players who like cozy logic puzzles",
    energy: "fun",
    narrationDefault: true,
  },
  bloxmigos: { platforms: ["android"], genre: "puzzle", energy: "energetic", narrationDefault: true },
};

/** Fills only the fields the owner has not set. */
export function seedFor(slug: string, current: GameProfile): Partial<Record<keyof GameProfile, unknown>> {
  const known = KNOWN_OWNED_GAMES[slug];
  if (!known) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(known)) {
    const cur = (current as Record<string, unknown>)[k];
    const empty = Array.isArray(cur) ? cur.length === 0 : cur === "" || cur === null || cur === undefined || JSON.stringify(cur) === JSON.stringify((DEFAULT_GAME_PROFILE as Record<string, unknown>)[k]);
    if (empty) out[k] = v;
  }
  return out;
}
