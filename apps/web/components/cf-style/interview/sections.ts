import { samples } from './samples'

/**
 * The interview is stored exactly as docs/creative-flo/STYLE-STUDIO-CONTRACT.md describes it:
 * { version, ratings: {sample id: rating}, notes: {sample id or "section:<id>": text}, answers: {question key: value} }.
 * Every field `key` below is a contract question key, so the builder reads them without any translation.
 */
export interface FieldSpec {
  key: string
  label: string
  type: 'text' | 'textarea' | 'list' | 'chips' | 'single' | 'bool' | 'range' | 'words' | 'color' | 'logo' | 'lengths'
  options?: readonly string[]
  /** Shown instead of the stored option value, for example the stored value "low" is shown as "Low". */
  labels?: Readonly<Record<string, string>>
  max?: number
  required?: boolean
  links?: boolean
  maxItems?: number
  hint?: string
}
export interface SectionSpec { id: string; title: string; description: string; samplePrefix?: string; fields: readonly FieldSpec[] }

const AUDIENCE = ['Business owners', 'Aspiring entrepreneurs', 'Consumers / shoppers', 'Professionals / B2B', 'Creators', 'Local community', 'Students'] as const
const MUSIC = ['Cinematic score', 'Dark trap / drill', 'Synthwave / electronic', 'Orchestral hybrid', 'Minimal lo-fi', 'Soulful / boom bap', 'Upbeat pop / indie', 'Acoustic / warm', 'Afrobeats', 'House', 'Piano emotional', 'No music'] as const
const YES_NO = ['Yes', 'No'] as const

const sectionSpecs = [
  { id: 'brand', title: 'Your brand', description: 'Tell us what makes this yours. Short answers are fine.', fields: [
    { key: 'brand', label: 'Brand or business name', type: 'text', required: true },
    { key: 'style_name', label: 'Name for this editing style', type: 'text', hint: 'Optional. You can change it later.' },
    { key: 'handle', label: 'Main social handle', type: 'text' },
    { key: 'sell', label: 'What do you sell, and to who?', type: 'textarea', required: true },
    { key: 'price_range', label: 'Price range', type: 'text' },
    { key: 'audience', label: 'Who is watching most?', type: 'chips', required: true, options: AUDIENCE },
    { key: 'transformation', label: 'What changes for your customer?', type: 'textarea' },
    { key: 'feel', label: 'What should viewers feel when a video ends?', type: 'text' },
    { key: 'action', label: 'What should viewers do next?', type: 'text' },
    { key: 'cta_keyword', label: 'Call to action keyword', type: 'text' },
    { key: 'words', label: 'Three words your brand IS, and three it is NEVER', type: 'words' },
    { key: 'refs', label: 'Creators, brands or films whose look you love', type: 'list', hint: 'One per line. Links are welcome. Tell us what you love in the section note.' },
    { key: 'avoid_refs', label: 'Creators you never want to look like', type: 'list', hint: 'One per line.' },
    { key: 'color1', label: 'Primary color', type: 'color' },
    { key: 'color2', label: 'Accent color', type: 'color' },
    { key: 'colorsMode', label: 'Brand colors', type: 'single', options: ['Use these colors', 'No brand colors yet'] },
    { key: 'logo_asset_id', label: 'Logo', type: 'logo' },
    { key: 'reference_videos', label: 'Reference videos', type: 'list', links: true, maxItems: 3, required: true, hint: 'Add 1 to 3 video links, one per line.' },
  ] },
  { id: 'platforms', title: 'Platforms and formats', description: 'Where your videos live shapes how they feel.', fields: [
    { key: 'platforms', label: 'Where does it post first?', type: 'chips', required: true, options: ['IG Reels', 'TikTok', 'YouTube Shorts', 'YouTube long-form', 'LinkedIn', 'X', 'Ads', 'Course / community'] },
    { key: 'formats', label: 'Formats you need', type: 'chips', options: ['Vertical 9:16 (Reels, TikTok, Shorts)', 'Horizontal 16:9 (YouTube)', 'Square / 4:5 (feed)'] },
    { key: 'lengths', label: 'Typical length for each format', type: 'lengths', hint: 'For example 20-40s.' },
    { key: 'frequency', label: 'How often do you post?', type: 'text' },
  ] },
  { id: 'templates', title: 'Editing styles', description: 'Rate complete styles. Borrow the pieces that feel like you.', samplePrefix: 'tmpl-', fields: [] },
  { id: 'looks', title: 'Ten looks', description: 'Choose a whole world, or mix one main look with pieces of another.', samplePrefix: 'look-', fields: [] },
  { id: 'type', title: 'Type', description: 'Headline on top, supporting face below. See how each pairing speaks.', samplePrefix: 'type-', fields: [] },
  { id: 'captions', title: 'Captions', description: 'The same words, very different personalities.', samplePrefix: 'cap-', fields: [] },
  { id: 'hooks', title: 'Hooks and structure', description: 'Give someone a reason to keep watching.', samplePrefix: 'hook-', fields: [
    { key: 'hook_styles', label: 'Hook styles you like', type: 'chips', options: ['Bold claim', 'Question', 'Result first', 'Story cold open', 'Pattern interrupt visual', 'On-screen hook text'] },
    { key: 'hook_energy', label: 'First 3 seconds energy', type: 'range', max: 5 },
    { key: 'chaptering', label: 'Chaptering', type: 'single', options: ['No chapters', 'Subtle labels', 'Full chapter cards'] },
    { key: 'end_tag', label: 'End tag style', type: 'chips', options: ['Logo end tag', 'Handle and tagline', 'Keyword card', 'Link in bio card', 'Book a call card', 'No end card'] },
    { key: 'cta', label: 'Call to action style', type: 'chips', options: ['Comment a keyword', 'Link in bio', 'DM me', 'Follow for more', 'Book a call', 'No CTA'] },
    { key: 'motif', label: 'Signature element in every video', type: 'chips', options: ['Logo end tag', 'A color flash / light line', 'A glitch tag', 'A sound / audio sting', 'A recurring prop or object'] },
    { key: 'motifNote', label: 'Your own signature idea', type: 'text' },
  ] },
  { id: 'transitions', title: 'Transitions', description: 'How one shot becomes the next. Two or three is usually enough.', samplePrefix: 'tr-', fields: [] },
  { id: 'motion', title: 'Motion graphics and B-roll', description: 'Choose what belongs around your story.', samplePrefix: 'motion-', fields: [
    { key: 'graphics_intensity', label: 'Graphic intensity', type: 'range', max: 5 },
    { key: 'card_tiers', label: 'Cards', type: 'single', options: ['Full-screen takeovers', 'Cards that keep my face visible', 'A mix of both'] },
    { key: 'broll_sources', label: 'B-roll sources', type: 'chips', options: ['Own footage', 'Stock', 'AI generated', 'Screen recordings', 'Memes'] },
    { key: 'zoom_frequency', label: 'Zoom and punch-in frequency', type: 'single', options: ['Rarely', 'On key points', 'Often'] },
    { key: 'stickers', label: 'Stickers and emoji', type: 'bool', options: YES_NO },
    { key: 'sound_text', label: 'Sound words on screen', type: 'bool', options: YES_NO },
  ] },
  { id: 'grade', title: 'Color grade', description: 'The same frame, six moods.', samplePrefix: 'grade-', fields: [] },
  { id: 'music', title: 'Music and sound', description: 'Set the mood without getting in the way of your voice.', fields: [
    { key: 'music', label: 'Music beds', type: 'chips', options: MUSIC },
    { key: 'music_energy', label: 'Music energy', type: 'range', max: 5 },
    { key: 'music_under', label: 'Music under talking', type: 'single', options: ['low', 'medium', 'off'], labels: { low: 'Low', medium: 'Medium', off: 'Off' } },
    { key: 'sound_design', label: 'Sound design', type: 'chips', options: ['Whooshes', 'Risers', 'Hits', 'Clicks', 'Record scratch', 'Silence for emphasis'] },
    { key: 'sfx_density', label: 'Sound effect density', type: 'range', max: 5 },
  ] },
  { id: 'pace', title: 'How much editing?', description: 'Let the person carry it, or make every beat a new visual.', samplePrefix: 'density-', fields: [
    { key: 'pace', label: 'Pace', type: 'range', max: 10 },
    { key: 'oncam', label: 'How much are you on camera?', type: 'single', options: ['Face the whole time', 'Face + heavy B-roll', 'Mostly visuals, my voice', 'No face, voiceover only', 'Depends on the format'] },
  ] },
  { id: 'other', title: 'Anything else', description: 'Your notes matter more than a rating. Tell us the details.', fields: [
    { key: 'perfect_video', label: 'Describe your perfect video', type: 'textarea' },
    { key: 'hate', label: 'What do you hate seeing in edits?', type: 'textarea' },
  ] },
] as const satisfies readonly SectionSpec[]

export type SectionId = typeof sectionSpecs[number]['id']
export type Section = SectionSpec & { id: SectionId }
export const sections: readonly Section[] = sectionSpecs
export const TEMPLATE_SAMPLE_PREFIX = 'tmpl-'
export const sectionNoteKey = (id: string) => `section:${id}`
export const templateSampleId = (key: string) => `${TEMPLATE_SAMPLE_PREFIX}${key}`
export function sectionSamples(section: Section) {
  const prefix = section.samplePrefix
  return prefix && section.id !== 'templates' ? samples.filter((sample) => sample.id.startsWith(prefix)) : []
}
export function isSectionId(id: string): id is SectionId { return sections.some((section) => section.id === id) }
export const sectionFields = (section: Section): readonly FieldSpec[] => section.fields
export const allFields: readonly FieldSpec[] = sections.flatMap(sectionFields)
export const fieldByKey = (key: string) => allFields.find((field) => field.key === key)
