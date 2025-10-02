import pool, { ensureSchema } from './db';

function normalizeDeviceUuid(deviceUuid: string): string {
  return deviceUuid.trim().toLowerCase();
}

export async function isDeviceAuthorized(deviceUuid: string | null | undefined): Promise<boolean> {
  if (!deviceUuid) {
    return false;
  }

  const normalized = normalizeDeviceUuid(deviceUuid);
  if (!normalized) {
    return false;
  }

  await ensureSchema();

  const result = await pool.query('SELECT 1 FROM admin_devices WHERE device_uuid = $1', [normalized]);
  return result.rows.length > 0;
}

export async function upsertDeviceUuid(deviceUuid: string, label?: string) {
  const normalized = normalizeDeviceUuid(deviceUuid);
  await ensureSchema();
  await pool.query(
    `INSERT INTO admin_devices (device_uuid, label)
     VALUES ($1, $2)
     ON CONFLICT (device_uuid)
     DO UPDATE SET label = COALESCE(EXCLUDED.label, admin_devices.label)` ,
    [normalized, label ?? null]
  );
}
