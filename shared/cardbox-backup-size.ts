import { MAX_BACKUP_BYTES } from "./cardbox";

/** UTF-8 size without allocating a second copy of a large JSON/base64 string. */
export function utf8Bytes(value: string) {
  let bytes = 0;
  for (let i = 0; i < value.length; i++) {
    const code = value.codePointAt(i)!;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
    if (code > 0xffff) i++;
  }
  return bytes;
}

export function assertBackupCapacity(plaintextBytes: number) {
  const padded = (Math.floor(plaintextBytes / 16) + 1) * 16;
  if (Math.ceil(padded / 3) * 4 + 512 > MAX_BACKUP_BYTES)
    throw new Error("备份超过 50 MB，请减少卡面图片大小或选择仅备份卡片资料。");
}
