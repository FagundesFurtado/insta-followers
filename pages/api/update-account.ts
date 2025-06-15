import type { NextApiRequest, NextApiResponse } from "next";
import { exec } from "child_process";
import path from "path";
import fs from "fs";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const { username } = req.query;

  if (!username || typeof username !== "string") {
    return res.status(400).json({ error: "Missing or invalid username" });
  }

  const scriptPath = path.join(process.cwd(), "scripts", "update_one.py");
  const dataPath = path.join(process.cwd(), "public", "data", `${username}.json`);

  exec(`python3 ${scriptPath} ${username}`, (error, stdout, stderr) => {
    if (error) {
      console.error("Script error:", stderr);
      return res.status(500).json({ error: "Failed to run script" });
    }

    if (!fs.existsSync(dataPath)) {
      return res.status(404).json({ error: "Data file not generated" });
    }

    try {
      const json = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
      return res.status(200).json({ success: true, data: json });
    } catch (err) {
      return res.status(500).json({ error: "Failed to read updated JSON" });
    }
  });
}
