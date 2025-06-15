import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export async function POST(request: Request) {
  try {
    const { username } = await request.json();

    if (!username) {
      return NextResponse.json(
        { error: "Username is required" },
        { status: 400 }
      );
    }

    // Read current accounts
    const accountsPath = path.join(process.cwd(), "data", "accounts.json");
    const accountsData = await fs.readFile(accountsPath, "utf-8");
    const accounts = JSON.parse(accountsData);

    // Check if account exists
    if (!accounts.includes(username)) {
      return NextResponse.json(
        { error: "Account does not exist" },
        { status: 400 }
      );
    }

    // Remove account from list
    const updatedAccounts = accounts.filter((acc: string) => acc !== username);
    await fs.writeFile(accountsPath, JSON.stringify(updatedAccounts, null, 2));

    // Delete account data file
    const accountDataPath = path.join(process.cwd(), "data", `${username}.json`);
    try {
      await fs.unlink(accountDataPath);
    } catch (error) {
      console.warn(`Account data file not found for ${username}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting account:", error);
    return NextResponse.json(
      { error: "Failed to delete account" },
      { status: 500 }
    );
  }
} 