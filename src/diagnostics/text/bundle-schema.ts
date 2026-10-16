import { z } from 'zod';

export const textSourceBundleSchemaId = 'reflection.text-source/v1';

const sha256Pattern = /^[a-f0-9]{64}$/;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

function isSafeRelativePath(path: string): boolean {
  return path.length > 0 && !path.startsWith('/') && !/^[A-Za-z]:/.test(path) && !path.includes('\\') && !path.includes('\0') && !path.split('/').includes('..');
}

const Sha256Schema = z.string().regex(sha256Pattern, 'expected a lowercase hex SHA-256');
const IdSchema = z.string().regex(idPattern, 'ids may contain letters, digits, ".", "_", ":" and "-"');
const RelativePathSchema = z.string().refine(isSafeRelativePath, 'must be a relative path inside the bundle directory');
const FiniteNumberSchema = z.number().finite();

export const BoxSchema = z.strictObject({
  x: FiniteNumberSchema,
  y: FiniteNumberSchema,
  width: FiniteNumberSchema.nonnegative(),
  height: FiniteNumberSchema.nonnegative()
});

const MeasurementBasisSchema = z.enum(['observed', 'inferred']);

const MeasuredBoxSchema = BoxSchema.extend({ basis: MeasurementBasisSchema });

const TrackingSchema = z.strictObject({ unit: z.enum(['px', 'percent']), value: FiniteNumberSchema });

const LineHeightSchema = z.strictObject({ unit: z.enum(['px', 'percent', 'normal']), value: FiniteNumberSchema.optional() }).refine(
  (lineHeight) => lineHeight.unit === 'normal' || lineHeight.value !== undefined,
  'a px or percent line height needs a value'
);

const TypographySchema = z.strictObject({
  family: z.string().min(1),
  postScriptName: z.string().min(1).optional(),
  style: z.string().min(1).optional(),
  size: FiniteNumberSchema.positive(),
  weight: FiniteNumberSchema.min(1).max(1000).optional(),
  stretch: FiniteNumberSchema.positive().optional(),
  axes: z.record(z.string().min(1), FiniteNumberSchema).optional(),
  tracking: TrackingSchema.optional(),
  lineHeight: LineHeightSchema.optional(),
  features: z.array(z.string().min(1)).optional(),
  direction: z.enum(['ltr', 'rtl']).optional(),
  language: z.string().min(1).optional(),
  wrapping: z.enum(['nowrap', 'wrap']).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/, 'expected #rrggbb or #rrggbbaa').optional()
});

const FontAssetSchema = z.strictObject({
  // null states explicitly that no checksum is known; it is never inferred.
  sha256: Sha256Schema.nullable(),
  note: z.string().min(1).optional()
});

const TransformSchema = z.tuple([FiniteNumberSchema, FiniteNumberSchema, FiniteNumberSchema, FiniteNumberSchema, FiniteNumberSchema, FiniteNumberSchema]);

const PartSchema = z.strictObject({
  id: IdSchema,
  expectedText: z.string().min(1),
  nodeId: z.string().min(1).optional(),
  layerName: z.string().min(1).optional(),
  box: MeasuredBoxSchema,
  baseline: z.strictObject({ y: FiniteNumberSchema, basis: MeasurementBasisSchema }).nullable(),
  transform: TransformSchema.nullable(),
  typography: TypographySchema,
  fontAsset: FontAssetSchema
});

const artifactMediaTypes = ['image/png', 'image/webp', 'image/svg+xml'] as const;

const ArtifactFields = {
  id: IdSchema,
  path: RelativePathSchema,
  mediaType: z.enum(artifactMediaTypes),
  bytes: z.number().int().positive(),
  sha256: Sha256Schema,
  nodeId: z.string().min(1).optional()
};

const ReferenceArtifactSchema = z.strictObject({
  ...ArtifactFields,
  role: z.literal('reference')
});

const OutlineArtifactSchema = z.strictObject({
  ...ArtifactFields,
  role: z.literal('outlined-source'),
  kind: z.enum(['frame', 'text-outline']),
  // Where the SVG's top-left lands in the reference coordinate space, in CSS pixels. Fractions are preserved.
  bounds: BoxSchema,
  partIds: z.array(IdSchema).optional()
});

const FileIdentitySchema = z
  .strictObject({
    reportedId: z.string().min(1).nullable(),
    attestedId: z.string().min(1).nullable(),
    verification: z.enum(['reported', 'caller-attested', 'unknown'])
  })
  .superRefine((identity, context) => {
    if (identity.verification === 'reported' && identity.reportedId === null) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['reportedId'], message: 'verification "reported" requires a reportedId; an attested id never replaces a null reported id' });
    }
    if (identity.verification === 'caller-attested' && identity.attestedId === null) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['attestedId'], message: 'verification "caller-attested" requires an attestedId' });
    }
    if (identity.verification === 'unknown' && (identity.reportedId !== null || identity.attestedId !== null)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['verification'], message: 'verification "unknown" cannot carry an id' });
    }
  });

const SourceSchema = z.strictObject({
  id: IdSchema,
  provider: z.string().min(1).optional(),
  scope: z.enum(['pinned', 'live-diagnostic']),
  capturedAt: z.string().datetime({ offset: true }),
  // null means the authoring version is not independently known; it is never filled in retroactively.
  sourceVersion: z.string().min(1).nullable(),
  document: z.strictObject({ id: z.string().min(1).nullable(), name: z.string().min(1).optional() }),
  fileIdentity: FileIdentitySchema,
  receipt: z.strictObject({ id: z.string().min(1), kind: z.string().min(1) }).optional(),
  exportSettings: z.record(z.string(), z.unknown()).optional()
});

const ViewportSchema = z.strictObject({
  width: FiniteNumberSchema.positive().max(16_384),
  height: FiniteNumberSchema.positive().max(16_384),
  deviceScaleFactor: FiniteNumberSchema.positive().max(8)
});

export const TextSourceBundleSchema = z
  .strictObject({
    schema: z.literal(textSourceBundleSchemaId),
    source: SourceSchema,
    context: z.record(z.string().min(1), z.string()).default({}),
    viewport: ViewportSchema,
    reference: ReferenceArtifactSchema,
    outlines: z.array(OutlineArtifactSchema).default([]),
    parts: z.array(PartSchema).min(1)
  })
  .superRefine((bundle, context) => {
    const artifactIds = new Set<string>([bundle.reference.id]);
    for (const [index, outline] of bundle.outlines.entries()) {
      if (artifactIds.has(outline.id)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['outlines', index, 'id'], message: `duplicate artifact id "${outline.id}"` });
      }
      artifactIds.add(outline.id);
      if (outline.mediaType !== 'image/svg+xml') {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['outlines', index, 'mediaType'], message: 'outlined source must be image/svg+xml' });
      }
      if (outline.kind === 'text-outline' && (outline.partIds?.length ?? 0) !== 1) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['outlines', index, 'partIds'], message: 'a text-outline artifact must name exactly one part' });
      }
    }

    if (bundle.reference.mediaType === 'image/svg+xml') {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['reference', 'mediaType'], message: 'the reference image must be PNG or WebP' });
    }

    const partIds = new Set<string>();
    for (const [index, part] of bundle.parts.entries()) {
      if (partIds.has(part.id)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['parts', index, 'id'], message: `duplicate part id "${part.id}"` });
      }
      partIds.add(part.id);
    }

    for (const [index, outline] of bundle.outlines.entries()) {
      for (const partId of outline.partIds ?? []) {
        if (!partIds.has(partId)) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: ['outlines', index, 'partIds'], message: `unknown part id "${partId}"` });
        }
      }
    }
  });

export type TextSourceBundle = z.output<typeof TextSourceBundleSchema>;
export type TextSourcePart = TextSourceBundle['parts'][number];
export type TextSourceOutline = TextSourceBundle['outlines'][number];
export type TextSourceBox = z.output<typeof BoxSchema>;
