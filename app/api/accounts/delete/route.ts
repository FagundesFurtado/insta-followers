import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export async function POST(request: Request) {
  const { username } = await request.json();

  if (!username) {
    return new NextResponse('Username is required', { status: 400 });
  }

  try {
    const filePath = path.join(process.cwd(), 'public', 'data', 'accounts.json');
    const fileContents = await fs.readFile(filePath, 'utf8');
    let accounts = JSON.parse(fileContents);

    const initialLength = accounts.length;
    accounts = accounts.filter((acc: any) => acc.username !== username);

    if (accounts.length === initialLength) {
      return new NextResponse('Account not found', { status: 404 });
    }

    await fs.writeFile(filePath, JSON.stringify(accounts, null, 2), 'utf8');

    return new NextResponse('Account deleted successfully', { status: 200 });
  } catch (error) {
    console.error('Error deleting account:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
