import { access, mkdir, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { PNG } from 'pngjs';
import type { ArtifactStore } from '../../core/artifact-store.js';
import { createBaselineStore, createMissingBaselineCheck } from '../../core/baseline-store.js';
import type { ArtifactRef, CheckResult } from '../../core/report-schema.js';
import { launchBrowser } from '../../integrations/playwright/browser-manager.js';
import { createBrowserContext } from '../../integrations/playwright/context-factory.js';
import { comparePngImages, formatVisualDiagnosticsDetails } from '../visual/image-diff.js';
import type { VisualThreshold } from '../visual/thresholds.js';

export type PrintRenderedPageCase = {
  id: string;
  page: number;
  baseline: string;
  baselineRoot?: string | undefined;
  threshold?: VisualThreshold | undefined;
  blocking?: boolean | undefined;
  strict?: boolean | undefined;
};

export type PrintCase = {
  id: string;
  route: string;
  viewport: string;
  scenario?: string | undefined;
  blocking: boolean;
  pdf: {
    format: string;
    printBackground: boolean;
    expectedPageCount?: number | undefined;
    expectedPageSize?: 'A4' | undefined;
    poppler: {
      mode: 'optional' | 'required';
      dpi: number;
    };
    renderedPages: PrintRenderedPageCase[];
  };
};

export type PrintContractConfig = {
  enabled?: boolean | undefined;
  cases: PrintCase[];
};

export type PrintBrowserConfig = {
  baseUrl: string;
  routes: Array<{ id: string; path: string }>;
};

export async function runPrintContract(input: {
  config: PrintContractConfig;
  browser: PrintBrowserConfig;
  store: ArtifactStore;
}): Promise<CheckResult[]> {
  if (input.config.enabled === false) {
    return [];
  }

  const browser = await launchBrowser();
  const checks: CheckResult[] = [];

  try {
    for (const printCase of input.config.cases) {
      checks.push(...(await runPrintCase({ printCase, browserConfig: input.browser, store: input.store, browser })));
    }
  } finally {
    await browser.close();
  }

  return checks;
}

async function runPrintCase(input: {
  printCase: PrintCase;
  browserConfig: PrintBrowserConfig;
  store: ArtifactStore;
  browser: Awaited<ReturnType<typeof launchBrowser>>;
}): Promise<CheckResult[]> {
  const route = input.browserConfig.routes.find((candidate) => candidate.id === input.printCase.route);
  const checks: CheckResult[] = [];
  const pdfArtifactPath = `print/${input.printCase.id}/document.pdf`;

  if (!route) {
    return [
      {
        id: `print.${input.printCase.id}.route`,
        suite: 'print',
        target: input.printCase.route,
        status: 'fail',
        severity: 'blocking',
        summary: `Print case ${input.printCase.id} references unknown browser route ${input.printCase.route}.`,
        artifacts: [],
        metadata: createPrintMetadata(input.printCase, { classification: 'missing-print-route' }),
        suggestedNextStep: 'Add the matching browser route before enabling this print case.'
      }
    ];
  }

  const context = await createBrowserContext(input.browser, input.printCase.viewport);
  const page = await context.newPage();
  try {
    await page.goto(new URL(route.path, input.browserConfig.baseUrl).toString(), { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 2_000 }).catch(() => undefined);
    const pdf = await page.pdf({
      format: input.printCase.pdf.format,
      printBackground: input.printCase.pdf.printBackground
    });
    const pdfArtifact = await input.store.writeBuffer(pdfArtifactPath, pdf);
    checks.push(createPdfGeneratedCheck(input.printCase, pdfArtifact));

    const poppler = await detectPoppler();
    if (!poppler.available) {
      checks.push(createMissingPopplerCheck(input.printCase, pdfArtifact));
      return checks;
    }

    const pdfPath = input.store.resolveRunPath(pdfArtifact.path);
    const pdfInfo = await readPdfInfo(pdfPath);
    checks.push(createPdfInfoCheck(input.printCase, pdfArtifact, pdfInfo));

    const renderedArtifacts: ArtifactRef[] = [];
    for (const pageCase of input.printCase.pdf.renderedPages) {
      const artifact = await renderPdfPage({
        store: input.store,
        pdfPath,
        printCaseId: input.printCase.id,
        page: pageCase.page,
        dpi: input.printCase.pdf.poppler.dpi
      });
      renderedArtifacts.push(artifact);
      checks.push(
        await comparePrintPageBaseline({
          printCase: input.printCase,
          pageCase,
          artifact,
          store: input.store
        })
      );
    }

    if (renderedArtifacts.length > 0) {
      checks.push(await createContactSheetCheck(input.printCase, renderedArtifacts, input.store));
    }
  } catch (error) {
    checks.push({
      id: `print.${input.printCase.id}.pdf`,
      suite: 'print',
      target: input.printCase.id,
      status: 'fail',
      severity: input.printCase.blocking ? 'blocking' : 'review',
      summary: `Print case ${input.printCase.id} failed: ${error instanceof Error ? error.message : String(error)}.`,
      artifacts: [],
      metadata: createPrintMetadata(input.printCase, { classification: 'print-generation-failure' }),
      suggestedNextStep: 'Inspect the print route in Chromium and fix PDF generation before updating baselines.'
    });
  } finally {
    await context.close();
  }

  return checks;
}

function createPdfGeneratedCheck(printCase: PrintCase, pdfArtifact: ArtifactRef): CheckResult {
  return {
    id: `print.${printCase.id}.pdf`,
    suite: 'print',
    target: printCase.id,
    status: 'pass',
    severity: 'info',
    summary: `${printCase.id} printed to PDF.`,
    artifacts: [pdfArtifact],
    metadata: createPrintMetadata(printCase, { classification: 'pdf-generated' })
  };
}

function createMissingPopplerCheck(printCase: PrintCase, pdfArtifact: ArtifactRef): CheckResult {
  const required = printCase.pdf.poppler.mode === 'required';
  return {
    id: `print.${printCase.id}.poppler`,
    suite: 'print',
    target: printCase.id,
    status: required ? 'fail' : 'warn',
    severity: required ? 'blocking' : 'review',
    summary: required
      ? 'Poppler is required for this print case but pdfinfo/pdftoppm were not found.'
      : 'Poppler was not found; PDF page-size checks and rendered page PNG evidence were skipped.',
    artifacts: [pdfArtifact],
    metadata: createPrintMetadata(printCase, { classification: 'missing-poppler' }),
    suggestedNextStep: 'Install Poppler to enable PDF page count, page size, rendered page, and contact-sheet evidence.'
  };
}

function createPdfInfoCheck(printCase: PrintCase, pdfArtifact: ArtifactRef, pdfInfo: PdfInfo): CheckResult {
  const failures: string[] = [];
  if (printCase.pdf.expectedPageCount !== undefined && pdfInfo.pages !== printCase.pdf.expectedPageCount) {
    failures.push(`Expected ${printCase.pdf.expectedPageCount} pages, found ${pdfInfo.pages}.`);
  }
  if (printCase.pdf.expectedPageSize === 'A4' && pdfInfo.pageSize !== 'A4') {
    failures.push(`Expected A4 page size, found ${pdfInfo.pageSize ?? 'unknown'}.`);
  }

  const failed = failures.length > 0;
  return {
    id: `print.${printCase.id}.pdf-info`,
    suite: 'print',
    target: printCase.id,
    status: failed ? 'fail' : 'pass',
    severity: failed && printCase.blocking ? 'blocking' : failed ? 'review' : 'info',
    summary: failed ? `${printCase.id} PDF metadata did not match expectations.` : `${printCase.id} PDF metadata matched expectations.`,
    ...(failed ? { details: failures.join('\n') } : {}),
    artifacts: [pdfArtifact],
    metadata: createPrintMetadata(printCase, {
      classification: failed ? 'pdf-info-mismatch' : 'pdf-info-match',
      pages: pdfInfo.pages,
      pageSize: pdfInfo.pageSize
    }),
    ...(failed ? { suggestedNextStep: 'Fix print layout/page generation before updating visual baselines.' } : {})
  };
}

async function comparePrintPageBaseline(input: {
  printCase: PrintCase;
  pageCase: PrintRenderedPageCase;
  artifact: ArtifactRef;
  store: ArtifactStore;
}): Promise<CheckResult> {
  const baselinePath = resolvePrintBaselinePath(input.pageCase);
  const blocking = input.pageCase.blocking === true || input.pageCase.strict === true;
  const strict = input.pageCase.strict === true || input.pageCase.blocking === true;

  if (!(await pathExists(baselinePath))) {
    return createMissingBaselineCheck({
      id: `print.${input.pageCase.id}`,
      target: `${input.printCase.id} page ${input.pageCase.page}`,
      baselinePath: input.pageCase.baseline,
      blocking,
      suite: 'print',
      artifacts: [input.artifact],
      metadata: createPrintMetadata(input.printCase, {
        page: input.pageCase.page,
        renderedPageId: input.pageCase.id
      })
    });
  }

  const artifactBase = `print/${input.printCase.id}/visual/${input.pageCase.id}`;
  const expectedArtifact = await input.store.writeBuffer(`${artifactBase}/expected.png`, await readFile(baselinePath));
  const diffRelativePath = `${artifactBase}/diff.png`;
  const diffPath = input.store.resolveRunPath(diffRelativePath);
  await mkdir(dirname(diffPath), { recursive: true });
  const result = await comparePngImages({
    expectedPath: baselinePath,
    actualPath: input.store.resolveRunPath(input.artifact.path),
    diffPath,
    ...(input.pageCase.threshold ? { threshold: input.pageCase.threshold } : {}),
    strict
  });
  const diffArtifact = result.diffPath ? await input.store.describeArtifact(diffRelativePath, 'visual-diff', 'diff') : undefined;
  const details = result.status === 'pass' ? undefined : formatVisualDiagnosticsDetails(result.diagnostics);
  const severity = result.status === 'fail' && blocking ? 'blocking' : 'review';

  return {
    id: `print.${input.pageCase.id}`,
    suite: 'print',
    target: `${input.printCase.id} page ${input.pageCase.page}`,
    status: result.status,
    severity,
    summary:
      result.status === 'pass'
        ? `${input.pageCase.id} matches approved print baseline.`
        : `${input.pageCase.id} differs from approved print baseline.`,
    ...(details ? { details } : {}),
    artifacts: [expectedArtifact, input.artifact, ...(diffArtifact ? [diffArtifact] : [])],
    metadata: createPrintMetadata(input.printCase, {
      ...result,
      page: input.pageCase.page,
      renderedPageId: input.pageCase.id,
      baselinePath: input.pageCase.baseline
    }),
    ...(result.status === 'pass'
      ? {}
      : { suggestedNextStep: 'Inspect expected, actual, and diff artifacts. If intentional, update only this print page baseline.' })
  };
}

async function renderPdfPage(input: {
  store: ArtifactStore;
  pdfPath: string;
  printCaseId: string;
  page: number;
  dpi: number;
}): Promise<ArtifactRef> {
  const outputPrefixRelative = `print/${input.printCaseId}/pages/page-${input.page}`;
  const outputPrefix = input.store.resolveRunPath(outputPrefixRelative);
  await mkdir(dirname(outputPrefix), { recursive: true });
  await execFileAsync('pdftoppm', ['-r', String(input.dpi), '-png', '-f', String(input.page), '-l', String(input.page), '-singlefile', input.pdfPath, outputPrefix]);
  return input.store.describeArtifact(`${outputPrefixRelative}.png`, 'document-page', 'actual');
}

async function createContactSheetCheck(printCase: PrintCase, artifacts: ArtifactRef[], store: ArtifactStore): Promise<CheckResult> {
  const images = await Promise.all(artifacts.map((artifact) => readPng(store.resolveRunPath(artifact.path))));
  const gap = 24;
  const width = Math.max(...images.map((image) => image.width));
  const height = images.reduce((sum, image) => sum + image.height, 0) + gap * Math.max(0, images.length - 1);
  const sheet = new PNG({ width, height, colorType: 6 });
  sheet.data.fill(255);

  let offsetY = 0;
  for (const image of images) {
    PNG.bitblt(image, sheet, 0, 0, image.width, image.height, 0, offsetY);
    offsetY += image.height + gap;
  }

  const artifact = await store.writeBuffer(`print/${printCase.id}/contact-sheet.png`, PNG.sync.write(sheet));
  return {
    id: `print.${printCase.id}.contact-sheet`,
    suite: 'print',
    target: printCase.id,
    status: 'pass',
    severity: 'info',
    summary: `${printCase.id} rendered page contact sheet generated.`,
    artifacts: [artifact],
    metadata: createPrintMetadata(printCase, { classification: 'contact-sheet-generated' })
  };
}

type PdfInfo = {
  pages?: number | undefined;
  pageSize?: 'A4' | 'unknown' | undefined;
};

async function readPdfInfo(pdfPath: string): Promise<PdfInfo> {
  const output = await execFileAsync('pdfinfo', [pdfPath]);
  const pagesMatch = /^Pages:\s+(\d+)/m.exec(output);
  const pageSizeLine = /^Page size:\s+(.+)$/m.exec(output)?.[1] ?? '';
  return {
    ...(pagesMatch ? { pages: Number.parseInt(pagesMatch[1] ?? '0', 10) } : {}),
    pageSize: /\bA4\b/.test(pageSizeLine) || /595\.|596\./.test(pageSizeLine) && /841\.|842\./.test(pageSizeLine) ? 'A4' : 'unknown'
  };
}

async function detectPoppler(): Promise<{ available: boolean }> {
  try {
    await Promise.all([execFileAsync('pdfinfo', ['-v']), execFileAsync('pdftoppm', ['-v'])]);
    return { available: true };
  } catch {
    return { available: false };
  }
}

function execFileAsync(command: string, args: string[]): Promise<string> {
  return new Promise((resolveCommand, rejectCommand) => {
    execFile(command, args, (error, stdout, stderr) => {
      if (error) {
        rejectCommand(new Error(stderr || error.message));
        return;
      }
      resolveCommand(`${stdout}${stderr}`);
    });
  });
}

async function readPng(path: string): Promise<PNG> {
  return PNG.sync.read(await readFile(path));
}

function resolvePrintBaselinePath(pageCase: PrintRenderedPageCase): string {
  const store = createBaselineStore(pageCase.baselineRoot ? { rootDir: pageCase.baselineRoot } : {});
  return store.resolveBaselinePath(pageCase.baseline);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function createPrintMetadata(printCase: PrintCase, metadata: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    printCaseId: printCase.id,
    routeId: printCase.route,
    viewport: printCase.viewport,
    ...(printCase.scenario ? { scenario: printCase.scenario } : {}),
    ...metadata
  };
}
