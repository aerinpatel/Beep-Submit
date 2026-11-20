import postgres from "postgres";
import * as dotenv from "dotenv";
import { prisma } from "./prisma";

dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

// Configure connection pool with connection limits suitable for serverless / scripts
const client = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export { client, prisma };
export * from "./jobs";
