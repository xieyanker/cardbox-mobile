import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import {
  BACKUP_RECORD_KEY,
  backupRecordSchema,
  createBackupRecord,
  type BackupRecord,
} from "../lib/cardbox-backup-record";
import { encryptLocal, decryptLocal } from "../lib/cardbox-security";
import type { Card } from "../shared/cardbox";
export function useCardboxBackupRecord() {
  const [value, setValue] = useState<BackupRecord | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(BACKUP_RECORD_KEY)
      .then(async (raw) => {
        const next =
          raw === null
            ? null
            : backupRecordSchema.parse(JSON.parse(await decryptLocal(raw)));
        if (active) setValue(next);
      })
      .catch(() => {
        if (active) setError("上次备份记录无法读取，卡包和备份文件不受影响。");
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);
  async function save(cards: Card[], includeImages = true) {
    if (!ready) throw new Error("备份记录尚未读取完成。");
    const next = createBackupRecord(
      cards,
      new Date().toISOString(),
      includeImages,
    );
    await AsyncStorage.setItem(
      BACKUP_RECORD_KEY,
      await encryptLocal(JSON.stringify(next)),
    );
    setValue(next);
    setError("");
  }
  return { value, ready, error, save };
}
