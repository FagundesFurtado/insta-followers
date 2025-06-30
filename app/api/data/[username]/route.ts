import { NextResponse, NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export async function GET(request: NextRequest, { params }: { params: { username: string } }) {
  const { username } = params;

  try {
    const filePath = path.join(process.cwd(), 'public', 'data', 'accounts.json');
    const fileContents = await fs.readFile(filePath, 'utf8');
    const accounts = JSON.parse(fileContents);

    const userAccount = accounts.find((account: any) => account.username === username);

    if (userAccount) {
      return NextResponse.json(userAccount);
    } else {
      return new NextResponse('User not found', { status: 404 });
    }
  } catch (error) {
    console.error('Error fetching user data:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
