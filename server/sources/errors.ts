/** Thrown when a source can't run (e.g. missing keys). The run continues without it. */
export class SourceSkipped extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceSkipped";
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
