import { proxyAuthRequest } from '@/lib/auth-api-proxy';
import type { NextRequest } from 'next/server';

type RouteContext = { params: Promise<{ path: string[] }> };

async function handle(req: NextRequest, context: RouteContext): Promise<Response> {
  const { path } = await context.params;
  return proxyAuthRequest(req, path);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
