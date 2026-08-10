
export type TimeoutCategory = "standard" | "extended";

const BASE_MS: Record<TimeoutCategory, number> = {
  standard: 20_000,
  extended: 30_000
};

async function adaptiveTimeoutMs(category: TimeoutCategory): Promise<number> {
  try {
    if 
  }
}

export async function fetchWithTimeout(
  url: string,
  options: Omit<RequestInit, "signal">,
  category: Timeout
)
