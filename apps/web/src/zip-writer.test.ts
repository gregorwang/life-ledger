import { describe, expect, it } from "vitest";

import { crc32, ZipWriter } from "./zip-writer";

async function build(files: Array<[string, string]>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const writer = new ZipWriter({ write: async (chunk) => void chunks.push(chunk) });
  for (const [path, content] of files) {
    await writer.addFile(path, new TextEncoder().encode(content), new Date(2026, 8, 24, 12, 0, 0));
  }
  await writer.finish();
  const total = chunks.reduce((size, chunk) => size + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

describe("ZipWriter", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("hello"))).toBe(0x3610a686);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it("writes a stored archive whose end record points at the directory", async () => {
    const zip = await build([
      ["README.md", "# 备份"],
      ["日常/2026/09月.md", "下雨天 ☕"],
    ]);
    const view = new DataView(zip.buffer);
    const end = zip.length - 22;
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(2);
    const centralOffset = view.getUint32(end + 16, true);
    expect(view.getUint32(centralOffset, true)).toBe(0x02014b50);
    // UTF-8 name flag set so Chinese paths survive on every OS.
    expect(view.getUint16(6, true) & 0x0800).toBe(0x0800);
  });

  it("rejects duplicate paths", async () => {
    await expect(build([["a.txt", "1"], ["a.txt", "2"]])).rejects.toThrow("重复");
  });
});
