const titles = new Map<string, Promise<string | null>>();

export function getYouTubeMusicTitle(videoId: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{1,24}$/.test(videoId)) return Promise.resolve(null);
  const existing = titles.get(videoId);
  if (existing) return existing;

  const endpoint = new URL("https://www.youtube.com/oembed");
  endpoint.searchParams.set("url", `https://www.youtube.com/watch?v=${videoId}`);
  endpoint.searchParams.set("format", "json");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  const request = fetch(endpoint, { signal: controller.signal, credentials: "omit" })
    .then(async response => {
      if (!response.ok) return null;
      const { title } = await response.json() as { title?: unknown };
      return typeof title === "string" ? title.trim().slice(0, 160) || null : null;
    })
    .catch(() => null)
    .then(title => {
      clearTimeout(timer);
      if (!title && titles.get(videoId) === request) titles.delete(videoId);
      return title;
    });
  if (titles.size >= 100) {
    const oldest = titles.keys().next().value;
    if (oldest) titles.delete(oldest);
  }
  titles.set(videoId, request);
  return request;
}
