import { createScheduledStartHandler } from "@/lib/live/start-handler";

export const POST = createScheduledStartHandler(name => process.env[name]);
