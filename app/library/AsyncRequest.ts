/**
 * Generic Async Request Manager
 *
 * Tracks asynchronous operations by a unique request ID.
 * Used to implement the "processing → in-progress → completed" polling pattern.
 *
 * Flow:
 *   1. Client calls the API → server starts the operation in the background
 *   2. Server immediately returns: { status: "processing", request_id: "xxx" }
 *   3. Client polls with the request_id
 *   4. Server responds: { status: "processing", message: "Still in progress" }
 *      until the operation completes
 *   5. Server responds: { status: "completed", data: { ...actual data... } }
 *
 * This is the same pattern already used for health data requests
 * (request_all_health_data → health-result), but generalized for any operation.
 */

export interface AsyncRequestEntry<T = any> {
  /** Unique request identifier */
  requestId: string;
  /** When the request was created */
  createdAt: Date;
  /** When the request expires (for cleanup) */
  expiresAt: Date;
  /** Current status */
  status: "processing" | "completed" | "failed";
  /** The result data (populated when completed) */
  data?: T;
  /** Error message (populated when failed) */
  error?: string;
  /** Optional metadata about what's being fetched */
  metadata?: {
    /** Human-readable description of the operation */
    operation?: string;
    /** Current step description */
    step?: string;
    /** Progress percentage (0-100) */
    progress?: number;
  };
}

export interface AsyncRequestOptions {
  /** Time in ms before a request entry expires (default: 5 minutes) */
  ttl?: number;
  /** Max concurrent requests per key (default: 1) */
  maxPerKey?: number;
}

export class AsyncRequestManager {
  private requests: Map<string, AsyncRequestEntry> = new Map();
  private readonly defaultTtl: number;
  private readonly defaultMaxPerKey: number;

  constructor(options: AsyncRequestOptions = {}) {
    this.defaultTtl = options.ttl ?? 5 * 60 * 1000; // 5 minutes
    this.defaultMaxPerKey = options.maxPerKey ?? 1;

    // Periodically clean up expired entries every 60 seconds
    setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Create a new async request entry.
   * Returns the entry if successful, or an error if a request is already in progress.
   */
  create<T = any>(
    requestId: string,
    operation: string,
    data?: Partial<AsyncRequestEntry<T>>
  ):
    | { success: true; entry: AsyncRequestEntry<T> }
    | { success: false; error: string } {
    // Check if a request with this ID already exists and is still processing
    const existing = this.requests.get(requestId);
    if (existing && existing.status === "processing") {
      return {
        success: false,
        error:
          "Request already in progress. Please wait for the previous request to complete.",
      };
    }

    const now = new Date();
    const entry: AsyncRequestEntry<T> = {
      requestId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.defaultTtl),
      status: "processing",
      metadata: {
        operation,
        ...data?.metadata,
      },
      ...data,
    };

    this.requests.set(requestId, entry);
    return { success: true, entry };
  }

  /**
   * Update an existing request's status to completed with data.
   */
  complete<T = any>(
    requestId: string,
    data: T
  ): { success: true } | { success: false; error: string } {
    const entry = this.requests.get(requestId);
    if (!entry) {
      return { success: false, error: "Request not found" };
    }

    entry.status = "completed";
    entry.data = data;
    entry.expiresAt = new Date(Date.now() + this.defaultTtl); // Extend TTL for polling
    return { success: true };
  }

  /**
   * Update an existing request's status to failed.
   */
  fail(
    requestId: string,
    error: string
  ): { success: true } | { success: false; error: string } {
    const entry = this.requests.get(requestId);
    if (!entry) {
      return { success: false, error: "Request not found" };
    }

    entry.status = "failed";
    entry.error = error;
    entry.expiresAt = new Date(Date.now() + this.defaultTtl);
    return { success: true };
  }

  /**
   * Get the current status of a request.
   */
  getStatus(requestId: string): AsyncRequestEntry | null {
    const entry = this.requests.get(requestId);
    if (!entry) return null;

    // Auto-expire stale entries
    if (
      entry.expiresAt < new Date() &&
      entry.status !== "completed" &&
      entry.status !== "failed"
    ) {
      entry.status = "failed";
      entry.error = "Request timed out";
    }

    return entry;
  }

  /**
   * Check if a request is currently processing.
   */
  isProcessing(requestId: string): boolean {
    const entry = this.requests.get(requestId);
    return !!entry && entry.status === "processing";
  }

  /**
   * Remove a request entry (manual cleanup).
   */
  remove(requestId: string): boolean {
    return this.requests.delete(requestId);
  }

  /**
   * Clean up expired entries.
   */
  cleanup(): number {
    const now = new Date();
    let removed = 0;
    for (const [key, entry] of this.requests) {
      if (
        (entry.status === "completed" || entry.status === "failed") &&
        entry.expiresAt < now
      ) {
        this.requests.delete(key);
        removed++;
      }
    }
    return removed;
  }

  /**
   * Get total number of tracked requests.
   */
  get size(): number {
    return this.requests.size;
  }
}
