import { describe, expect, it } from 'vitest';
import { inspectSvg } from '../../src/diagnostics/text/svg-safety.js';

function svg(body: string, attributes = 'width="40" height="16" viewBox="0 0 40 16"'): Buffer {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ${attributes}>${body}</svg>`);
}

function codes(content: Buffer): string[] {
  const result = inspectSvg(content);
  return result.accepted ? [] : result.findings.map((finding) => finding.code);
}

describe('inspectSvg', () => {
  it('accepts outlined path content and reports its intrinsic size', () => {
    const result = inspectSvg(svg('<defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs><g fill="url(#g)"><path d="M0 0L40 16" transform="translate(0.5 0)"/></g>'));

    expect(result).toMatchObject({ accepted: true, width: 40, height: 16 });
  });

  it('accepts same-document references and px sizes', () => {
    expect(inspectSvg(svg('<defs><path id="a" d="M0 0"/></defs><use xlink:href="#a"/><use href="#a"/>', 'width="40px" height="16px"')).accepted).toBe(true);
  });

  it.each([
    ['script elements', '<script>alert(1)</script>', 'svg-active-element'],
    ['foreignObject', '<foreignObject><div/></foreignObject>', 'svg-active-element'],
    ['animation that can retarget attributes', '<set attributeName="href" to="javascript:alert(1)"/>', 'svg-active-element'],
    ['style elements', '<style>@import url(http://evil.test/a.css);</style>', 'svg-active-element'],
    ['event handler attributes', '<path d="M0 0" onload="alert(1)"/>', 'svg-event-handler'],
    ['external hrefs', '<use href="http://evil.test/x.svg#a"/>', 'svg-external-reference'],
    ['file hrefs', '<use xlink:href="file:///etc/passwd"/>', 'svg-external-reference'],
    ['javascript hrefs', '<use href="javascript:alert(1)"/>', 'svg-external-reference'],
    ['external url() fills', '<path d="M0 0" fill="url(http://evil.test/p)"/>', 'svg-external-reference'],
    ['external url() in style', '<path d="M0 0" style="fill:url(\'https://evil.test/p\')"/>', 'svg-external-reference'],
    ['data URLs in values', '<path d="M0 0" style="background:url(data:image/png;base64,AAAA)"/>', 'svg-unsafe-value'],
    ['css import in a style attribute', '<path d="M0 0" style="@import url(#a)"/>', 'svg-unsafe-value']
  ])('rejects %s as invalid', (_label, body, code) => {
    const result = inspectSvg(svg(body));

    expect(result).toMatchObject({ accepted: false, state: 'invalid' });
    expect(codes(svg(body))).toContain(code);
  });

  it('rejects DOCTYPE, entities, CDATA and processing instructions before parsing', () => {
    const doctype = Buffer.from('<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg" width="1" height="1">&x;</svg>');
    expect(codes(doctype)).toEqual(['svg-doctype']);
    expect(codes(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><![CDATA[x]]></svg>'))).toEqual(['svg-cdata']);
    expect(codes(Buffer.from('<?xml-stylesheet href="http://evil.test/a.css"?><svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'))).toEqual(['svg-processing-instruction']);
  });

  it('allows the XML declaration', () => {
    expect(inspectSvg(Buffer.from('<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>')).accepted).toBe(true);
  });

  it('reports live text and benign unsupported elements as unsupported, not invalid', () => {
    expect(inspectSvg(svg('<text x="0" y="10">Refresh</text>'))).toMatchObject({ accepted: false, state: 'unsupported' });
    expect(codes(svg('<text>Refresh</text>'))).toEqual(['svg-live-text']);
    expect(codes(svg('<filter id="f"><feGaussianBlur stdDeviation="1"/></filter>'))).toContain('svg-unsupported-element');
    expect(codes(svg('<image href="#a"/>'))).toEqual(['svg-unsupported-element']);
  });

  it('prefers invalid when content is both unsupported and unsafe', () => {
    expect(inspectSvg(svg('<text>x</text><script>1</script>'))).toMatchObject({ accepted: false, state: 'invalid' });
  });

  it('rejects malformed XML, non-UTF-8 bytes and a wrong root', () => {
    expect(codes(Buffer.from('<svg><path></svg>'))).toEqual(['svg-malformed']);
    expect(codes(Buffer.from([0xff, 0xfe, 0x00]))).toEqual(['svg-not-utf8']);
    expect(codes(Buffer.from('<html xmlns="http://www.w3.org/1999/xhtml"/>'))).toContain('svg-root');
  });

  it('requires a usable pixel size within limits', () => {
    expect(codes(svg('', 'viewBox="0 0 0 0"'))).toEqual(['svg-no-size']);
    expect(codes(svg('', 'width="100%" height="100%"'))).toEqual(['svg-no-size']);
    expect(codes(svg('', 'width="99999" height="10"'))).toEqual(['svg-dimension-limit']);
  });

  it('enforces byte, node, depth and path-data bounds', () => {
    const limits = { maxBytes: 10_000, maxNodes: 100, maxDepth: 64, maxPathDataCharacters: 1_000_000, maxDimension: 16_384 };
    expect(inspectSvg(svg('<g/>'.repeat(10)), { ...limits, maxBytes: 100 })).toMatchObject({ accepted: false, findings: [{ code: 'svg-too-large' }] });
    expect(inspectSvg(svg('<g/>'.repeat(10)), { ...limits, maxNodes: 3 })).toMatchObject({ accepted: false, findings: [{ code: 'svg-too-many-nodes' }] });
    expect(inspectSvg(svg('<g><g><g><g><g/></g></g></g></g>'), { ...limits, maxDepth: 3 })).toMatchObject({ accepted: false, findings: [{ code: 'svg-too-deep' }] });
    expect(inspectSvg(svg(`<path d="${'M0 0 '.repeat(100)}"/>`), { ...limits, maxPathDataCharacters: 20 })).toMatchObject({ accepted: false, findings: [{ code: 'svg-path-too-complex' }] });
  });
});
