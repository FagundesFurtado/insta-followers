import { NextResponse } from 'next/server';
import pool, { ensureSchema } from '@/lib/db';
import { isDeviceAuthorized } from '@/lib/auth';

export async function POST(request: Request) {
  const { username } = await request.json();

  if (!username) {
    return new NextResponse('Username is required', { status: 400 });
  }

  try {
    const normalizedUsername = String(username).trim().toLowerCase();

    if (!normalizedUsername) {
      return new NextResponse('Username is required', { status: 400 });
    }

    const deviceUuid = request.headers.get('x-device-uuid');
    if (!(await isDeviceAuthorized(deviceUuid))) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    await ensureSchema();

    const existing = await pool.query<{ is_deleted: boolean }>(
      'SELECT is_deleted FROM accounts WHERE username = $1',
      [normalizedUsername]
    );

    if (existing.rows.length > 0) {
      const [{ is_deleted }] = existing.rows;
      if (!is_deleted) {
        return new NextResponse('Account already exists', { status: 409 });
      }

      await pool.query(
        `UPDATE accounts
         SET is_deleted = FALSE,
             deleted_at = NULL
         WHERE username = $1`,
        [normalizedUsername]
      );

      return new NextResponse('Account reactivated successfully', { status: 200 });
    }

    await pool.query(
      `INSERT INTO accounts (username, is_deleted, deleted_at)
       VALUES ($1, FALSE, NULL)`,
      [normalizedUsername]
    );

    return new NextResponse('Account added successfully', { status: 201 });
  } catch (error) {
    console.error('Error adding account:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
