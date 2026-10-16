import { XMLParser, XMLValidator } from 'fast-xml-parser';

export interface SvgLimits {
  maxBytes: number;
  maxNodes: number;
  maxDepth: number;
  maxPathDataCharacters: number;
  maxDimension: number;
}

export const defaultSvgLimits: SvgLimits = {
  maxBytes: 2 * 1024 * 1024,
  maxNodes: 50_000,
  maxDepth: 64,
  maxPathDataCharacters: 1_000_000,
  maxDimension: 16_384
};

export interface SvgFinding {
  code: string;
  message: string;
}

export interface SvgInspectionAccepted {
  accepted: true;
  width: number;
  height: number;
  nodeCount: number;
  elementNames: string[];
}

export interface SvgInspectionRejected {
  accepted: false;
  // invalid: active, external or malformed content. unsupported: benign content this renderer does not model.
  state: 'invalid' | 'unsupported';
  findings: SvgFinding[];
}

export type SvgInspection = SvgInspectionAccepted | SvgInspectionRejected;

const allowedElements = new Set([
  'svg',
  'g',
  'defs',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'clipPath',
  'mask',
  'linearGradient',
  'radialGradient',
  'stop',
  'title',
  'desc',
  'use'
]);

const activeElements = new Set([
  'script',
  'foreignObject',
  'iframe',
  'object',
  'embed',
  'animate',
  'animateMotion',
  'animateTransform',
  'animateColor',
  'set',
  'style',
  'a',
  'audio',
  'video',
  'canvas',
  'link',
  'handler',
  'listener'
]);

const outlineOnlyElements = new Set(['text', 'tspan', 'textPath', 'tref']);

const referenceAttributes = new Set(['href', 'xlink:href']);
const fragmentReference = /^#[A-Za-z_][\w.:-]*$/;
const urlFunction = /url\(\s*(['"]?)([^)'"]*)\1\s*\)/gi;
const activeValuePatterns: Array<[RegExp, string]> = [
  [/javascript:/i, 'javascript: URL'],
  [/data:/i, 'data: URL'],
  [/@import/i, '@import rule'],
  [/expression\s*\(/i, 'CSS expression()'],
  [/vbscript:/i, 'vbscript: URL']
];

export function inspectSvg(content: Buffer, limits: SvgLimits = defaultSvgLimits): SvgInspection {
  if (content.length > limits.maxBytes) {
    return reject('invalid', [{ code: 'svg-too-large', message: `SVG is ${content.length} bytes; the limit is ${limits.maxBytes}.` }]);
  }

  let source: string;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(content);
  } catch {
    return reject('invalid', [{ code: 'svg-not-utf8', message: 'SVG is not valid UTF-8.' }]);
  }

  const markupFinding = inspectMarkupDeclarations(source);
  if (markupFinding) {
    return reject('invalid', [markupFinding]);
  }

  // The parser alone tolerates mismatched tags, so well-formedness is checked first.
  const validity = XMLValidator.validate(source, { allowBooleanAttributes: false });
  if (validity !== true) {
    return reject('invalid', [{ code: 'svg-malformed', message: `SVG is not well-formed XML: ${validity.err.msg}` }]);
  }

  let parsed: unknown;
  try {
    parsed = new XMLParser({
      preserveOrder: true,
      ignoreAttributes: false,
      attributeNamePrefix: '',
      processEntities: false,
      allowBooleanAttributes: false,
      parseTagValue: false,
      parseAttributeValue: false,
      trimValues: false,
      ignoreDeclaration: true,
      ignorePiTags: true
    }).parse(source);
  } catch (error) {
    return reject('invalid', [{ code: 'svg-malformed', message: `SVG is not well-formed XML: ${error instanceof Error ? error.message : String(error)}` }]);
  }

  return inspectTree(parsed, limits);
}

function inspectMarkupDeclarations(source: string): SvgFinding | undefined {
  // Rejected before parsing so no entity or external subset is ever expanded.
  if (/<!DOCTYPE/i.test(source) || /<!ENTITY/i.test(source)) {
    return { code: 'svg-doctype', message: 'SVG declares a DOCTYPE or entity, which is not allowed.' };
  }

  if (/<!\[CDATA\[/i.test(source)) {
    return { code: 'svg-cdata', message: 'SVG contains CDATA, which is not allowed.' };
  }

  const processingInstructions = source.match(/<\?(?!xml\s)[^>]*\?>/gi);
  if (processingInstructions && processingInstructions.length > 0) {
    return { code: 'svg-processing-instruction', message: 'SVG contains a processing instruction other than the XML declaration.' };
  }

  return undefined;
}

interface PreservedNode {
  [name: string]: unknown;
}

function inspectTree(parsed: unknown, limits: SvgLimits): SvgInspection {
  const invalid: SvgFinding[] = [];
  const unsupported: SvgFinding[] = [];
  const elementNames = new Set<string>();
  let nodeCount = 0;
  let pathCharacters = 0;
  let rootAttributes: Record<string, string> | undefined;
  let rootCount = 0;

  if (!Array.isArray(parsed)) {
    return reject('invalid', [{ code: 'svg-malformed', message: 'SVG has no root element.' }]);
  }

  const stack: Array<{ nodes: PreservedNode[]; depth: number }> = [{ nodes: parsed as PreservedNode[], depth: 0 }];
  while (stack.length > 0) {
    const frame = stack.pop();
    if (!frame) {
      break;
    }

    if (frame.depth > limits.maxDepth) {
      return reject('invalid', [{ code: 'svg-too-deep', message: `SVG nesting exceeds ${limits.maxDepth} levels.` }]);
    }

    for (const node of frame.nodes) {
      const name = Object.keys(node).find((key) => key !== ':@' && key !== '#text' && key !== '#comment');
      if (name === undefined) {
        continue;
      }

      nodeCount += 1;
      if (nodeCount > limits.maxNodes) {
        return reject('invalid', [{ code: 'svg-too-many-nodes', message: `SVG has more than ${limits.maxNodes} elements.` }]);
      }

      const attributes = (node[':@'] as Record<string, string> | undefined) ?? {};
      elementNames.add(name);
      if (frame.depth === 0) {
        rootCount += 1;
        rootAttributes = attributes;
        if (name !== 'svg') {
          invalid.push({ code: 'svg-root', message: `Root element is <${name}>, expected <svg>.` });
        }
      }

      classifyElement(name, invalid, unsupported);
      inspectAttributes(name, attributes, invalid);
      if (name === 'path' && typeof attributes.d === 'string') {
        pathCharacters += attributes.d.length;
        if (pathCharacters > limits.maxPathDataCharacters) {
          return reject('invalid', [{ code: 'svg-path-too-complex', message: `SVG path data exceeds ${limits.maxPathDataCharacters} characters.` }]);
        }
      }

      const children = node[name];
      if (Array.isArray(children)) {
        stack.push({ nodes: children as PreservedNode[], depth: frame.depth + 1 });
      }
    }
  }

  if (rootCount !== 1) {
    invalid.push({ code: 'svg-root', message: `SVG must have exactly one root element, found ${rootCount}.` });
  }

  if (invalid.length > 0) {
    return reject('invalid', dedupe(invalid));
  }

  if (unsupported.length > 0) {
    return reject('unsupported', dedupe(unsupported));
  }

  const size = readIntrinsicSize(rootAttributes ?? {}, limits);
  if ('findings' in size) {
    return reject('invalid', size.findings);
  }

  return { accepted: true, width: size.width, height: size.height, nodeCount, elementNames: [...elementNames].sort() };
}

function classifyElement(name: string, invalid: SvgFinding[], unsupported: SvgFinding[]): void {
  if (allowedElements.has(name)) {
    return;
  }

  if (activeElements.has(name)) {
    invalid.push({ code: 'svg-active-element', message: `<${name}> is active or external content and is not allowed.` });
    return;
  }

  if (outlineOnlyElements.has(name)) {
    unsupported.push({ code: 'svg-live-text', message: `<${name}> is live text; the source must be outlined to paths.` });
    return;
  }

  unsupported.push({ code: 'svg-unsupported-element', message: `<${name}> is not supported by the passive renderer.` });
}

function inspectAttributes(element: string, attributes: Record<string, string>, invalid: SvgFinding[]): void {
  for (const [attribute, rawValue] of Object.entries(attributes)) {
    const value = String(rawValue);
    if (/^on/i.test(attribute)) {
      invalid.push({ code: 'svg-event-handler', message: `<${element}> has event handler attribute "${attribute}".` });
      continue;
    }

    if (referenceAttributes.has(attribute)) {
      if (!fragmentReference.test(value.trim())) {
        invalid.push({ code: 'svg-external-reference', message: `<${element}> ${attribute} must be a same-document #fragment.` });
      }
      continue;
    }

    for (const [pattern, label] of activeValuePatterns) {
      if (pattern.test(value)) {
        invalid.push({ code: 'svg-unsafe-value', message: `<${element}> ${attribute} contains a ${label}.` });
      }
    }

    for (const match of value.matchAll(urlFunction)) {
      if (!fragmentReference.test((match[2] ?? '').trim())) {
        invalid.push({ code: 'svg-external-reference', message: `<${element}> ${attribute} references a non-fragment url().` });
      }
    }
  }
}

function readIntrinsicSize(attributes: Record<string, string>, limits: SvgLimits): { width: number; height: number } | { findings: SvgFinding[] } {
  const viewBox = typeof attributes.viewBox === 'string' ? attributes.viewBox.trim().split(/[\s,]+/).map(Number) : undefined;
  const fromViewBox = viewBox && viewBox.length === 4 && viewBox.every(Number.isFinite) ? { width: viewBox[2] as number, height: viewBox[3] as number } : undefined;
  const width = parseLength(attributes.width) ?? fromViewBox?.width;
  const height = parseLength(attributes.height) ?? fromViewBox?.height;

  if (width === undefined || height === undefined || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { findings: [{ code: 'svg-no-size', message: 'SVG needs positive pixel width/height or a viewBox.' }] };
  }

  if (width > limits.maxDimension || height > limits.maxDimension) {
    return { findings: [{ code: 'svg-dimension-limit', message: `SVG size ${width}x${height} exceeds ${limits.maxDimension}px.` }] };
  }

  return { width, height };
}

function parseLength(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const match = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*(px)?\s*$/i.exec(value);
  return match ? Number(match[1]) : Number.NaN;
}

function reject(state: 'invalid' | 'unsupported', findings: SvgFinding[]): SvgInspectionRejected {
  return { accepted: false, state, findings };
}

function dedupe(findings: SvgFinding[]): SvgFinding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.code}:${finding.message}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
