// Shared helper to log AI Gateway usage to the ai_usage_logs table.
// Import in any edge function that calls https://ai.gateway.lovable.dev

import { createClient } from "npm:@supabase/supabase-js@2.45.0";

interface LogAiUsageParams {
  functionName: string;
  model?: string | null;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  } | null;
  userId?: string | null;
  context?: Record<string, unknown> | null;
  status?: "success" | "error";
  errorMessage?: string | null;
}

export async function logAiUsage(params: LogAiUsageParams): Promise<void> {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) {
      console.warn("logAiUsage: missing SUPABASE_URL or SERVICE_ROLE_KEY");
      return;
    }
    const supabase = createClient(url, serviceKey);

    const { error } = await supabase.from("ai_usage_logs").insert({
      function_name: params.functionName,
      model: params.model ?? null,
      prompt_tokens: params.usage?.prompt_tokens ?? null,
      completion_tokens: params.usage?.completion_tokens ?? null,
      total_tokens: params.usage?.total_tokens ?? null,
      user_id: params.userId ?? null,
      context: params.context ?? null,
      status: params.status ?? "success",
      error_message: params.errorMessage ?? null,
    });

    if (error) {
      console.error("logAiUsage insert failed:", error.message);
    }
  } catch (e) {
    // Never throw from logging
    console.error("logAiUsage exception:", e);
  }
}
