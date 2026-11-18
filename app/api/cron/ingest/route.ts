import { NextRequest, NextResponse } from "next/server";
import { runPipeline, type PipelineOptions } from "@/lib/pipeline";

// Configure maximum serverless execution time (up to 300 seconds on supported plans)
export const maxDuration = 300;
// Disable static route generation / response caching
export const dynamic = "force-dynamic";

/**
 * Validates request authorization against the configured CRON_SECRET.
 * Supports:
 *  1. Header: Authorization: Bearer <CRON_SECRET> (Vercel Cron standard)
 *  2. Header: x-cron-secret: <CRON_SECRET>
 *  3. Query Param: ?secret=<CRON_SECRET>
 */
function isAuthorized(request: NextRequest): boolean {
  const expectedSecret = process.env.CRON_SECRET;

  // In production, CRON_SECRET must be configured
  if (!expectedSecret) {
    console.error("[Cron Auth] CRON_SECRET is not configured in environment variables.");
    return false;
  }

  // Check Authorization Bearer header
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const bearerToken = authHeader.substring(7).trim();
    if (bearerToken === expectedSecret) return true;
  }

  // Check custom header
  const customHeader = request.headers.get("x-cron-secret");
  if (customHeader?.trim() === expectedSecret) {
    return true;
  }

  // Check URL query parameter
  const querySecret = request.nextUrl.searchParams.get("secret");
  if (querySecret?.trim() === expectedSecret) {
    return true;
  }

  return false;
}

/**
 * Handler for GET requests (default method used by Vercel Cron)
 */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      {
        success: false,
        error: "Unauthorized: Invalid or missing CRON_SECRET token.",
      },
      { status: 401 }
    );
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const maxPostsParam = searchParams.get("maxPostsToTag");
    const maxPostsToTag = maxPostsParam ? parseInt(maxPostsParam, 10) : undefined;

    const options: PipelineOptions = {
      ...(maxPostsToTag && !isNaN(maxPostsToTag) ? { maxPostsToTag } : {}),
    };

    console.log(`[Cron Ingest] Initiating pipeline via GET trigger...`);
    const result = await runPipeline(options);

    const httpStatus = result.status === "failed" ? 500 : 200;
    return NextResponse.json(
      {
        success: result.status !== "failed",
        ...result,
        timestamp: new Date().toISOString(),
      },
      { status: httpStatus }
    );
  } catch (error: unknown) {
    const message = (error as Error)?.message || "Unknown error occurred";
    console.error(`[Cron Ingest] Execution failed: ${message}`);
    return NextResponse.json(
      {
        success: false,
        error: message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * Handler for POST requests (used for manual webhooks or custom triggers with JSON body)
 */
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      {
        success: false,
        error: "Unauthorized: Invalid or missing CRON_SECRET token.",
      },
      { status: 401 }
    );
  }

  try {
    let options: PipelineOptions = {};
    try {
      const body = await request.json();
      if (body && typeof body === "object") {
        if (typeof body.maxPostsToTag === "number") {
          options.maxPostsToTag = body.maxPostsToTag;
        }
        if (Array.isArray(body.sourceFilter)) {
          options.sourceFilter = body.sourceFilter;
        }
      }
    } catch {
      // Body is optional; ignore JSON parse error if body is empty
    }

    console.log(`[Cron Ingest] Initiating pipeline via POST trigger...`);
    const result = await runPipeline(options);

    const httpStatus = result.status === "failed" ? 500 : 200;
    return NextResponse.json(
      {
        success: result.status !== "failed",
        ...result,
        timestamp: new Date().toISOString(),
      },
      { status: httpStatus }
    );
  } catch (error: unknown) {
    const message = (error as Error)?.message || "Unknown error occurred";
    console.error(`[Cron Ingest] Execution failed: ${message}`);
    return NextResponse.json(
      {
        success: false,
        error: message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
