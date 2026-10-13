/**
 * Chore icons: either an emoji (stored as-is) or one of the bundled chore
 * pictures (stored as "pic:<name>", e.g. "pic:make_bed").
 */
const PICTURE_FILES = import.meta.glob('../../assets/chore-icons/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export const PICTURE_PREFIX = 'pic:';

export interface ChorePicture {
  /** File name without extension, e.g. "make_bed". */
  id: string;
  url: string;
  /** "Make bed" */
  label: string;
}

function labelFor(id: string): string {
  const words = id.split('_');
  return [words[0][0].toUpperCase() + words[0].slice(1), ...words.slice(1)].join(' ');
}

export const CHORE_PICTURES: ChorePicture[] = Object.entries(PICTURE_FILES)
  .map(([path, url]) => {
    const id = path.split('/').pop()!.replace(/\.png$/, '');
    return { id, url, label: labelFor(id) };
  })
  .sort((a, b) => a.label.localeCompare(b.label));

const byId = new Map(CHORE_PICTURES.map((p) => [p.id, p]));

/** The picture an icon value refers to, if it's a picture. */
export function pictureFor(icon: string | undefined): ChorePicture | undefined {
  return icon?.startsWith(PICTURE_PREFIX) ? byId.get(icon.slice(PICTURE_PREFIX.length)) : undefined;
}

const words = (s: string) =>
  s.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean).map((w) => w.replace(/s$/, ''));

/** Single words that point at a picture when the full name doesn't match one. */
const KEYWORDS: Record<string, string> = {
  vacuum: 'vacuum_floors', mop: 'mop_floors', sweep: 'sweep_floors', dust: 'dust_surfaces',
  trash: 'take_out_trash', garbage: 'take_out_trash', laundry: 'do_laundry', dishe: 'wash_dishes',
  dish: 'wash_dishes', toilet: 'clean_toilets', bathroom: 'clean_toilets', shower: 'clean_shower_tub',
  tub: 'clean_shower_tub', plant: 'water_plants', lawn: 'mow_lawn', mow: 'mow_lawn', weed: 'weed_garden',
  garden: 'weed_garden', bed: 'make_bed', sheet: 'make_bed', toy: 'put_away_toys', dog: 'feed_pets',
  cat: 'feed_pets', pet: 'feed_pets', recycle: 'recycling', recycling: 'recycling', grocerie: 'grocery_shopping',
  window: 'clean_windows', mirror: 'clean_mirrors', fridge: 'clean_fridge', oven: 'clean_oven_stovetop',
  stove: 'clean_oven_stovetop', microwave: 'clean_microwave', rug: 'clean_rugs', tidy: 'general_tidying',
  declutter: 'declutter_spaces', counter: 'clean_kitchen_surfaces', sink: 'clean_sinks', table: 'clear_table',
};

/**
 * The picture that best fits a chore name: one whose words all appear in the
 * name (most specific wins: "Unload dishwasher" → unload_dishwasher, not
 * load_dishwasher), else a keyword match ("Vacuum living room" → vacuum_floors).
 */
export function suggestPicture(name: string): ChorePicture | undefined {
  const nameWords = new Set(words(name));
  if (nameWords.size === 0) return undefined;
  let best: ChorePicture | undefined;
  let bestCount = 0;
  for (const p of CHORE_PICTURES) {
    const pw = words(p.label);
    if (pw.every((w) => nameWords.has(w)) && pw.length > bestCount) {
      best = p;
      bestCount = pw.length;
    }
  }
  if (best) return best;
  for (const w of nameWords) {
    const id = KEYWORDS[w];
    if (id && byId.has(id)) return byId.get(id);
  }
  return undefined;
}

/** A chore's icon: its picture, its emoji, or nothing. */
export function ChoreIcon({ icon, className = '' }: { icon?: string; className?: string }) {
  if (!icon) return null;
  const picture = pictureFor(icon);
  if (picture) {
    return <img className={`chore-pic ${className}`} src={picture.url} alt="" aria-hidden="true" draggable={false} />;
  }
  if (icon.startsWith(PICTURE_PREFIX)) return null; // a picture that no longer exists
  return <span className={className} aria-hidden="true">{icon}</span>;
}
