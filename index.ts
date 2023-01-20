import { serve } from "https://deno.land/std@0.131.0/http/server.ts";
import handler from "./handler.ts";

const PORT = 3002 || Deno.env.get("PORT");

serve(handler, {
  port: PORT,
});
