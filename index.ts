import { serve } from "https://deno.land/std@0.131.0/http/server.ts";
import handler from "./handler.ts";

const PORT = Number(Deno.env.get("PORT")) || 3002;

serve(handler, {
  port: PORT,
});
