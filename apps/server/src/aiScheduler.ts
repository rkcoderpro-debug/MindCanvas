import { config } from "./config.js";
import { AIError } from "./gemini.js";

type Ticket = {
  userId: string;
  work: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timer?: ReturnType<typeof setTimeout>;
};

/**
 * Keeps a shared server-side Gemini key from being stampeded by multiple tabs
 * or users. Queueing is FIFO while limiting each account to one active AI job,
 * so one user cannot occupy every available slot.
 */
export class AiScheduler {
  private active = 0;
  private readonly activeUsers = new Set<string>();
  private readonly queue: Ticket[] = [];

  constructor(
    private readonly maxConcurrent: number,
    private readonly maxQueued: number,
    private readonly queueTimeoutMs: number,
    private readonly maxQueuedPerUser = 2,
  ) {}

  run<T>(userId: string, work: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const ticket: Ticket = { userId, work, resolve: value => resolve(value as T), reject };
      if (this.canStart(ticket)) {
        this.start(ticket);
        return;
      }
      const queuedForUser = this.queue.filter(item => item.userId === userId).length;
      if (this.queue.length >= this.maxQueued || queuedForUser >= this.maxQueuedPerUser) {
        reject(new AIError("AI_BUSY", "AI đang xử lý nhiều yêu cầu. Vui lòng đợi một chút rồi thử lại.", 429, 15));
        return;
      }
      ticket.timer = setTimeout(() => {
        const index = this.queue.indexOf(ticket);
        if (index >= 0) this.queue.splice(index, 1);
        reject(new AIError("AI_BUSY", "Yêu cầu đã chờ quá lâu vì AI đang bận. Vui lòng thử lại sau khoảng 15 giây.", 429, 15));
      }, this.queueTimeoutMs);
      this.queue.push(ticket);
      this.pump();
    });
  }

  snapshot() {
    return { active: this.active, queued: this.queue.length };
  }

  private canStart(ticket: Ticket) {
    return this.active < this.maxConcurrent && !this.activeUsers.has(ticket.userId);
  }

  private start(ticket: Ticket) {
    if (ticket.timer) clearTimeout(ticket.timer);
    this.active += 1;
    this.activeUsers.add(ticket.userId);
    void ticket.work().then(ticket.resolve, ticket.reject).finally(() => {
      this.active -= 1;
      this.activeUsers.delete(ticket.userId);
      this.pump();
    });
  }

  private pump() {
    while (this.active < this.maxConcurrent) {
      const nextIndex = this.queue.findIndex(ticket => !this.activeUsers.has(ticket.userId));
      if (nextIndex < 0) return;
      const [ticket] = this.queue.splice(nextIndex, 1);
      this.start(ticket);
    }
  }
}

export const aiScheduler = new AiScheduler(config.AI_MAX_CONCURRENT, config.AI_MAX_QUEUE, config.AI_QUEUE_TIMEOUT_MS, config.AI_MAX_QUEUE_PER_USER);
