import type { ComparisonOutcome, PlatformFont } from './record.js';

export type FontIdentityClassification =
  | 'postscript-equal'
  | 'postscript-conflict'
  | 'family-equal'
  | 'style-qualified-family-alias'
  | 'style-qualifier-conflict'
  | 'name-extends-source-family'
  | 'name-differs-custom-font'
  | 'system-font-mismatch';

export interface IdentityEvidence {
  check: string;
  // null means the fact was not available, which is different from it failing.
  passed: boolean | null;
  detail?: string;
}

export interface PaintedFontJudgement {
  familyName: string;
  postScriptName: string | null;
  isCustomFont: boolean;
  glyphCount: number;
  classification: FontIdentityClassification;
  comparison: ComparisonOutcome;
  note: string;
  evidence: IdentityEvidence[];
}

export interface SourceFontFacts {
  family: string;
  style?: string | undefined;
  postScriptName?: string | undefined;
}

export interface FontIdentityContext {
  // First family of the element's computed font-family stack, as the CSS declared it.
  cssFirstFamily: string | null;
  loadedFaces: Array<{ family: string; weight: string; style: string; status: string }>;
  sourceWeight?: number | undefined;
}

export interface IdentitySummary {
  comparison: ComparisonOutcome;
  classification: FontIdentityClassification;
  note: string;
}

const normalize = (value: string): string => value.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Names are compared in tiers so a CSS family alias is not mistaken for a fallback, and a real fallback is not excused.
 * Name-level agreement is reported as such; it never establishes that the font binary is the authoring font.
 */
export function judgePaintedFont(font: PlatformFont, source: SourceFontFacts, context: FontIdentityContext): PaintedFontJudgement {
  const base = { familyName: font.familyName, postScriptName: font.postScriptName, isCustomFont: font.isCustomFont, glyphCount: font.glyphCount };
  const evidence = collectEvidence(font, source, context);
  const painted = normalize(font.familyName);
  const family = normalize(source.family);

  if (source.postScriptName && font.postScriptName) {
    const equal = normalize(source.postScriptName) === normalize(font.postScriptName);
    return {
      ...base,
      classification: equal ? 'postscript-equal' : 'postscript-conflict',
      comparison: equal ? 'match' : 'mismatch',
      evidence,
      note: equal
        ? 'The painted font and the source name the same PostScript font.'
        : `The source names PostScript font ${source.postScriptName} but the browser painted ${font.postScriptName}.`
    };
  }

  if (painted === family) {
    return { ...base, classification: 'family-equal', comparison: 'match', evidence, note: 'The painted font carries the source family name; this does not establish font-binary identity.' };
  }

  if (source.style && painted === `${family} ${normalize(source.style)}`) {
    return {
      ...base,
      classification: 'style-qualified-family-alias',
      comparison: 'match',
      evidence,
      note: `The painted font's internal family name "${font.familyName}" is the source family "${source.family}" plus the source style "${source.style}". A static font's internal name commonly carries its style while CSS registers it under the plain family. This is a name-level mapping and does not establish font-binary identity.`
    };
  }

  if (painted.startsWith(`${family} `)) {
    const qualifier = painted.slice(family.length + 1);
    if (source.style) {
      return {
        ...base,
        classification: 'style-qualifier-conflict',
        comparison: 'mismatch',
        evidence,
        note: `The painted font "${font.familyName}" extends the source family with "${qualifier}", but the source style is "${source.style}".`
      };
    }

    return {
      ...base,
      classification: 'name-extends-source-family',
      comparison: 'unknown',
      evidence,
      note: `The painted font's internal name "${font.familyName}" extends the source family "${source.family}" with "${qualifier}", and the source supplies no style to tie the qualifier to. The raw names are reported; substitution is not established.`
    };
  }

  if (!font.isCustomFont) {
    return {
      ...base,
      classification: 'system-font-mismatch',
      comparison: 'mismatch',
      evidence,
      note: `The browser reports a non-web font "${font.familyName}" that carries no name from the source family "${source.family}": fallback or substitution is established by the browser's own report.`
    };
  }

  return {
    ...base,
    classification: 'name-differs-custom-font',
    comparison: 'unknown',
    evidence,
    note: `The painted web font's internal name "${font.familyName}" differs from the source family "${source.family}". An @font-face rule can register any file under any family, so substitution is not established by the names alone. The raw names are reported.`
  };
}

export function summarizeIdentity(judgements: PaintedFontJudgement[]): IdentitySummary {
  const mismatch = judgements.find((judgement) => judgement.comparison === 'mismatch');
  const unknown = judgements.find((judgement) => judgement.comparison === 'unknown');
  const chosen = mismatch ?? unknown ?? judgements[0];
  if (!chosen) {
    return { comparison: 'unknown', classification: 'name-differs-custom-font', note: 'No painted font was reported.' };
  }

  const prefix = judgements.length > 1 ? `${judgements.length} fonts painted this text. ` : '';
  return { comparison: chosen.comparison, classification: chosen.classification, note: `${prefix}${chosen.note}` };
}

export function firstCssFamily(fontFamily: unknown): string | null {
  if (typeof fontFamily !== 'string' || fontFamily.trim() === '') {
    return null;
  }

  const first = fontFamily.split(',')[0]?.trim().replace(/^["']|["']$/g, '');
  return first ? first : null;
}

function collectEvidence(font: PlatformFont, source: SourceFontFacts, context: FontIdentityContext): IdentityEvidence[] {
  const family = normalize(source.family);
  const registered = context.loadedFaces.filter((face) => face.status === 'loaded' && normalize(face.family.replace(/^["']|["']$/g, '')) === family);
  const covering = registered.filter((face) => weightCovers(face.weight, context.sourceWeight));
  return [
    { check: 'painted-font-is-web-font', passed: font.isCustomFont },
    {
      check: 'css-first-family-equals-source-family',
      passed: context.cssFirstFamily === null ? null : normalize(context.cssFirstFamily) === family,
      ...(context.cssFirstFamily !== null ? { detail: context.cssFirstFamily } : {})
    },
    {
      check: 'loaded-face-registered-under-source-family',
      passed: registered.length > 0,
      detail: registered.length > 0 ? registered.map((face) => `${face.family} ${face.weight} ${face.style}`).join('; ') : 'none'
    },
    { check: 'registered-face-covers-source-weight', passed: context.sourceWeight === undefined ? null : covering.length > 0 }
  ];
}

function weightCovers(faceWeight: string, sourceWeight: number | undefined): boolean {
  if (sourceWeight === undefined) {
    return true;
  }

  const parts = faceWeight.split(/\s+/).map((part) => (part === 'normal' ? 400 : part === 'bold' ? 700 : Number(part)));
  const [low, high] = [parts[0], parts[1] ?? parts[0]];
  return low !== undefined && high !== undefined && Number.isFinite(low) && Number.isFinite(high) && sourceWeight >= low && sourceWeight <= high;
}
