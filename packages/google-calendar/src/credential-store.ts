import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface CalendarCredentialStore {
  getRefreshToken(secretRef: string): Promise<string | null>;
  saveRefreshToken(secretRef: string, refreshToken: string): Promise<void>;
}

export class LocalFileCalendarCredentialStore implements CalendarCredentialStore {
  constructor(private readonly filePath: string) {}

  async getRefreshToken(secretRef: string): Promise<string | null> {
    const entries = await this.readEntries();
    return entries[secretRef] ?? null;
  }

  async saveRefreshToken(secretRef: string, refreshToken: string): Promise<void> {
    const entries = await this.readEntries();
    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.filePath}.tmp`;
    await writeFile(temporaryPath, JSON.stringify({ ...entries, [secretRef]: refreshToken }), { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, this.filePath);
  }

  private async readEntries(): Promise<Record<string, string>> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.filePath, "utf8"));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid credential store");
      return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw error;
    }
  }
}
