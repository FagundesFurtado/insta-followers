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
    const accounts = JSON.parse(fileContents);

    if (accounts.some((acc: any) => acc.username === username)) {
      return new NextResponse('Account already exists', { status: 409 });
    }

    const newAccount = { username, history: [] }; // Initialize with empty history
    accounts.push(newAccount);

    await fs.writeFile(filePath, JSON.stringify(accounts, null, 2), 'utf8');

    return new NextResponse('Account added successfully', { status: 200 });
  } catch (error) {
    console.error('Error adding account:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
