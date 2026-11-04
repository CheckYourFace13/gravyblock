/**
 * Product demo videos. A demo is built from REAL states of the product's public interface (captured by driving the live site), rendered
 * deterministically frame by frame with smooth cursor, focus and caption motion, a real voiceover and original music. Every spoken or
 * written product claim is tied to a verified Product Truth fact and a quote from the page it came from.
 */

export const CANVAS = { w: 1080, h: 1920, fps: 30 } as const;
/** Where the product screen sits inside the 1080x1920 frame. */
export const WIN = { x: 60, y: 330, w: 960, h: 1180, r: 44 } as const;
/** CSS width of every captured screen (a phone). */
export const PLATE_CSS_W = 390;
export const SCREEN_SCALE = WIN.w / PLATE_CSS_W;
export const TRANSITION_MS = 420;

/** x, y, width, height in the plate's CSS pixels. */
export type Rect = [number, number, number, number];

export type PlateState = { file: string; label: string; /** text the live page showed in this state, kept as evidence */ result?: string };
export type PlateManifest = {
  id: string;
  url: string;
  title: string;
  capturedAt: string;
  /** Visible text of the live page, used to prove every quoted claim is really on it. */
  text: string;
  w: number;
  h: number;
  states: Record<string, PlateState>;
  rects: Record<string, Rect>;
};
/** Provenance of real gameplay footage: every frame comes from a screencast of the real game, nothing is drawn or synthesised. */
export type GameplayMeta = {
  source: string;
  capturedAt: string;
  method: string;
  /** measured frame rate of the screencast inside each window used in the video */
  windows: Array<{ scene: string; fromSec: number; toSec: number; capturedFps: number }>;
  /** events seen in the game's own HUD text during the used windows */
  hudEvents: string[];
  levelsCleared: number;
};
export type Manifest = { capturedAt: string; viewport: { w: number; h: number; dpr: number }; plates: Record<string, PlateManifest>; logo: string; gameplay?: GameplayMeta; /** numbered gameplay frame sequences (30 fps), by scene */ clips?: Record<string, { frames: string[]; fps: number; fromSec: number }> };

// ---- plan ---------------------------------------------------------------------------------------------------------------

/** A quote that must appear in the visible text of a captured page. */
export type ClaimSource = { plate: string; quote: string };
/** One statement the video makes about the product, with the facts and page text that support it. */
export type Claim = { id: string; text: string; /** fragments of verified fact values; resolved to fact ids at run time */ facts: string[]; sources: ClaimSource[] };

export type NarrationLine = {
  id: string;
  sceneId: string;
  /** What the voice says. `{name}` markers (zero width) tie an on-screen action to the next spoken word. */
  spoken: string;
  /** What the caption shows (may differ from the spoken form, e.g. a web address). Defaults to the spoken words. */
  caption?: string;
  claims: string[];
};

export type WordTime = { text: string; from: number; to: number };
export type LineAudio = { id: string; start: number; end: number; /** where the audio file for this line starts, ms from the line start (leading silence trimmed) */ words: WordTime[]; markers: Record<string, number>; file: string };

// ---- timeline consumed by the stage ---------------------------------------------------------------------------------------

export type CameraKey = { t: number; cx: number; cy: number; zoom: number };
export type CursorKey = { t: number; x: number; y: number; tap?: boolean; hide?: boolean };
export type SpotKey = { from: number; to: number; rect: Rect; label?: string };
export type StageScene = {
  id: string;
  kind: "screen" | "end";
  start: number;
  end: number;
  plate?: string;
  /** which captured state is shown, from `at` ms after the scene starts */
  states?: Array<{ at: number; state: string }>;
  camera?: CameraKey[];
  cursor?: CursorKey[];
  spots?: SpotKey[];
  headline?: { text: string; from: number; to: number };
  /** real gameplay: a numbered frame sequence played at real speed (30 fps), starting `from` ms into the footage */
  clip?: { frames: string[]; fps: number; from: number };
  kicker?: string;
  end_card?: { headline: string; button: string; url: string };
};
export type CaptionGroup = { from: number; to: number; words: WordTime[] };
export type Timeline = {
  durationMs: number;
  /** where the product screen sits; defaults to WIN */
  win?: { x: number; y: number; w: number; h: number; r: number };
  brand: { name: string; accent: string; dark: string; light: string; logo: string; /** optional palette; defaults are the RentalNoodle look */ palette?: { blobs: [string, string]; endFrom: string; endMid: string; endTo: string; button: string; ripple: string } };
  plates: Record<string, { w: number; h: number; states: Record<string, string> }>;
  scenes: StageScene[];
  captions: CaptionGroup[];
};

export type DemoAudioInfo = {
  voiceover: { engine: string; model: string; voice: string; license: string; cost: string; speed: number };
  music: { source: string; license: string; cost: string };
};

/** Stored in ms_videos.storyboard for a demo video (version 2), and read by the Review page. */
export type DemoRecord = {
  version: 2;
  kind: "demo";
  classification: "PRODUCT_DEMO";
  title: string;
  durationMs: number;
  transcript: Array<{ id: string; sceneId: string; text: string; caption: string; startMs: number; endMs: number }>;
  scenes: Array<{
    id: string;
    kind: "screen" | "end";
    startMs: number;
    endMs: number;
    purpose: string;
    motion: string[];
    headline?: string;
    sourceVisual?: { plate: string; url: string; capturedAt: string; states: string[]; note: string };
  }>;
  claims: Array<{ id: string; text: string; sceneId: string; factIds: string[]; factsVerified: boolean; sources: Array<{ url: string; capturedAt: string; quote: string; onPage: boolean }> }>;
  /** Every string shown on screen apart from the captioned voiceover, and the claim that backs it. */
  onScreen: Array<{ sceneId: string; kind: "headline" | "label" | "cta"; text: string; claim: string }>;
  cta: { text: string; url: string };
  /** Games only: the launch state the call to action was derived from (Product Truth), so later changes can flag stale creative. */
  ctaPhase?: "pre_launch" | "store_live";
  /** Headline of the closing card, shown on the Review page. */
  endHeadline?: string;
  /** Set when the owner has approved this exact video as a production quality reference. */
  ownerApproval?: { status: "OWNER_APPROVED_REFERENCE"; at: string; by: string; note: string };
  audio: DemoAudioInfo;
  capturedAt: string;
};
