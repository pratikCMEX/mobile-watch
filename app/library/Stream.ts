import { Response } from "express";

/**
 * Represents a single chunk sent during a streaming response.
 */
export interface StreamChunk<T = any> {
  /** Status label for this chunk, e.g. "processing", "fetching", "completed" */
  status: "processing" | "fetching" | "completed" | "error";
  /** Human-readable message describing what this chunk represents */
  message: string;
  /** Optional data payload for this step */
  data?: T;
  /** Optional progress indicator (0–100) */
  progress?: number;
}

/**
 * Sends an initial "processing" response immediately.
 *
 * This tells the client: "Your request has been received and is being processed."
 * The connection stays open for further chunks.
 *
 * @param res - Express response object
 * @param message - Optional custom message
 */
export function sendProcessing(
  res: Response,
  message: string = "Processing your request"
): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // Disable nginx buffering if behind reverse proxy
  });

  const chunk: StreamChunk = {
    status: "processing",
    message,
    progress: 0,
  };
  res.write(`data: ${JSON.stringify(chunk)}\n\n`);
}

/**
 * Sends a progress/fetching chunk during an ongoing operation.
 *
 * Use this when a sub-task completes (e.g. "Fetched heart_rate data").
 *
 * @param res - Express response object
 * @param message - Description of what was fetched
 * @param data - Optional data payload for this step
 * @param progress - Optional progress percentage (0–100)
 */
export function sendFetching<T = any>(
  res: Response,
  message: string,
  data?: T,
  progress?: number
): void {
  const chunk: StreamChunk<T> = {
    status: "fetching",
    message,
    data,
    progress,
  };
  res.write(`data: ${JSON.stringify(chunk)}\n\n`);
}

/**
 * Sends the final "completed" chunk and closes the stream.
 *
 * @param res - Express response object
 * @param message - Completion message
 * @param data - Final aggregated data
 * @param progress - Should typically be 100
 */
export function sendCompleted<T = any>(
  res: Response,
  message: string,
  data?: T,
  progress: number = 100
): void {
  const chunk: StreamChunk<T> = {
    status: "completed",
    message,
    data,
    progress,
  };
  res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  res.end();
}

/**
 * Sends an "error" chunk and closes the stream.
 *
 * @param res - Express response object
 * @param message - Error message
 * @param data - Optional error details
 */
export function sendError<T = any>(
  res: Response,
  message: string,
  data?: T
): void {
  const chunk: StreamChunk<T> = {
    status: "error",
    message,
    data,
  };
  res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  res.end();
}
