/**
 * Minimal streaming ZIP writer (stored, no compression — photos and videos
 * are already compressed). Each file is handed over whole, so its CRC and
 * size go straight into the local header; that is the most widely readable
 * layout. Zip64 records are added only when the archive outgrows 4 GiB or
 * 65 535 entries.
 */

export interface ZipSink {
  write(chunk: Uint8Array): Promise<void>;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array, seed = 0): number {
  let crc = ~seed >>> 0;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = CRC_TABLE[(crc ^ bytes[index]!) & 0xff]! ^ (crc >>> 8);
  }
  return ~crc >>> 0;
}

const MAX_32 = 0xffffffff;
const MAX_16 = 0xffff;

function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

class Bytes {
  private readonly view: DataView;
  readonly buffer: Uint8Array;
  private offset = 0;

  constructor(size: number) {
    this.buffer = new Uint8Array(size);
    this.view = new DataView(this.buffer.buffer);
  }

  u16(value: number) {
    this.view.setUint16(this.offset, value, true);
    this.offset += 2;
    return this;
  }

  u32(value: number) {
    this.view.setUint32(this.offset, value >>> 0, true);
    this.offset += 4;
    return this;
  }

  u64(value: number) {
    this.view.setBigUint64(this.offset, BigInt(value), true);
    this.offset += 8;
    return this;
  }

  bytes(value: Uint8Array) {
    this.buffer.set(value, this.offset);
    this.offset += value.length;
    return this;
  }
}

interface CentralRecord {
  name: Uint8Array;
  crc: number;
  size: number;
  offset: number;
  time: number;
  date: number;
}

export class ZipWriter {
  private readonly sink: ZipSink;
  private readonly records: CentralRecord[] = [];
  private readonly names = new Set<string>();
  private offset = 0;
  private finished = false;

  constructor(sink: ZipSink) {
    this.sink = sink;
  }

  get bytesWritten(): number {
    return this.offset;
  }

  private async emit(chunk: Uint8Array) {
    await this.sink.write(chunk);
    this.offset += chunk.length;
  }

  async addFile(path: string, data: Uint8Array, modified = new Date()): Promise<void> {
    if (this.finished) {
      throw new Error("ZIP already finished.");
    }
    if (data.length >= MAX_32) {
      throw new Error(`「${path}」超过 4GB，无法放进备份。`);
    }
    if (this.names.has(path)) {
      throw new Error(`重复的文件路径：${path}`);
    }
    this.names.add(path);
    const name = new TextEncoder().encode(path);
    const { time, date } = dosDateTime(modified);
    const crc = crc32(data);
    const record: CentralRecord = { name, crc, size: data.length, offset: this.offset, time, date };
    const header = new Bytes(30 + name.length)
      .u32(0x04034b50)
      .u16(20) // version needed
      .u16(0x0800) // UTF-8 names
      .u16(0) // stored
      .u16(time)
      .u16(date)
      .u32(crc)
      .u32(data.length)
      .u32(data.length)
      .u16(name.length)
      .u16(0)
      .bytes(name);
    await this.emit(header.buffer);
    await this.emit(data);
    this.records.push(record);
  }

  async finish(): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    const centralStart = this.offset;
    for (const record of this.records) {
      const zip64 = record.offset >= MAX_32;
      const extra = zip64 ? new Bytes(12).u16(0x0001).u16(8).u64(record.offset).buffer : new Uint8Array();
      const entry = new Bytes(46 + record.name.length + extra.length)
        .u32(0x02014b50)
        .u16(zip64 ? 45 : 20) // version made by
        .u16(zip64 ? 45 : 20) // version needed
        .u16(0x0800)
        .u16(0)
        .u16(record.time)
        .u16(record.date)
        .u32(record.crc)
        .u32(record.size)
        .u32(record.size)
        .u16(record.name.length)
        .u16(extra.length)
        .u16(0) // comment
        .u16(0) // disk
        .u16(0) // internal attributes
        .u32(0) // external attributes
        .u32(zip64 ? MAX_32 : record.offset)
        .bytes(record.name)
        .bytes(extra);
      await this.emit(entry.buffer);
    }
    const centralSize = this.offset - centralStart;
    const count = this.records.length;
    const needsZip64 = count >= MAX_16 || centralStart >= MAX_32 || centralSize >= MAX_32;
    if (needsZip64) {
      const zip64EndOffset = this.offset;
      await this.emit(
        new Bytes(56)
          .u32(0x06064b50)
          .u64(44)
          .u16(45)
          .u16(45)
          .u32(0)
          .u32(0)
          .u64(count)
          .u64(count)
          .u64(centralSize)
          .u64(centralStart).buffer,
      );
      await this.emit(
        new Bytes(20).u32(0x07064b50).u32(0).u64(zip64EndOffset).u32(1).buffer,
      );
    }
    await this.emit(
      new Bytes(22)
        .u32(0x06054b50)
        .u16(0)
        .u16(0)
        .u16(needsZip64 ? MAX_16 : count)
        .u16(needsZip64 ? MAX_16 : count)
        .u32(needsZip64 ? MAX_32 : centralSize)
        .u32(needsZip64 ? MAX_32 : centralStart)
        .u16(0).buffer,
    );
  }
}
