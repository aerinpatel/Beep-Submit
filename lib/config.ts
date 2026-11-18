// Central Configuration (lib/config.ts) - Single source of tunables

export const ROLES = [
  "Software Engineering",
  "Data/ML",
  "Design",
  "Marketing",
  "Sales",
  "Operations",
  "Finance",
  "Content",
  "HR",
  "Other",
] as const;

export const CITIES = [
  "Bangalore",
  "Pune",
  "Mumbai",
  "Delhi NCR",
  "Hyderabad",
  "Chennai",
  "Remote",
  "Other",
  "Unknown",
] as const;

// Deterministic normalizer alias map
export const CITY_ALIASES: Record<string, (typeof CITIES)[number]> = {
  // Bangalore
  bangalore: "Bangalore",
  bengaluru: "Bangalore",
  blr: "Bangalore",

  // Pune
  pune: "Pune",
  pun: "Pune",

  // Mumbai
  mumbai: "Mumbai",
  bombay: "Mumbai",
  "navi mumbai": "Mumbai",
  thane: "Mumbai",

  // Delhi NCR
  "delhi ncr": "Delhi NCR",
  delhi: "Delhi NCR",
  "new delhi": "Delhi NCR",
  gurgaon: "Delhi NCR",
  gurugram: "Delhi NCR",
  noida: "Delhi NCR",
  "greater noida": "Delhi NCR",
  ghaziabad: "Delhi NCR",
  faridabad: "Delhi NCR",

  // Hyderabad
  hyderabad: "Hyderabad",
  secunderabad: "Hyderabad",
  hyd: "Hyderabad",

  // Chennai
  chennai: "Chennai",
  madras: "Chennai",
  maa: "Chennai",

  // Remote
  remote: "Remote",
  "work from home": "Remote",
  wfh: "Remote",
  anywhere: "Remote",
  "india - remote": "Remote",
  "remote - india": "Remote",
  virtual: "Remote",
};

// Target public company board slugs for ATS fetchers
export const GREENHOUSE_COMPANIES = [
  "razorpay",
  "cred",
  "swiggy",
  "meesho",
  "postman",
  "browserstack",
  "slice",
  "inmobi",
  "clevertap",
  "urbancompany",
  "cultfit",
  "groww",
  "dream11",
  "mpl",
  "ola",
  "lead",
  "spinny",
  "lenskart",
  "curefit",
  "navi",
  "bharatpe",
  "cars24",
  "deliveroo",
  "grab",
  "appliedintuition",
] as const;

export const LEVER_COMPANIES = [
  "pocketfm",
  "urbancompany",
  "atlassian",
  "hotstar",
  "airtelxlabs",
  "juspay",
  "curefoods",
  "yellowai",
  "zeta",
  "payu",
] as const;

export const ASHBY_COMPANIES = [
  "ramp",
  "linear",
  "monzo",
  "vanta",
  "sentry",
] as const;

// Fresher / early career keywords for filtering
export const FRESHER_KEYWORDS = [
  "intern",
  "internship",
  "graduate",
  "fresher",
  "campus",
  "trainee",
  "junior",
  "associate",
  "entry level",
  "early career",
  "analyst",
  "coordinator",
  "specialist",
  "executive",
  "sde 1",
  "sde-1",
  "sde i",
  "analyst 1",
  "0-1",
  "0 - 1",
  "0 to 1",
  "2024",
  "2025",
  "2026",
  "university",
  "apprentice",
] as const;

// LLM & Pipeline configuration
export const CONFIG = {
  llm: {
    provider: (process.env.LLM_PROVIDER || "groq") as "groq" | "anthropic",
    model: process.env.GROQ_MODEL || "openai/gpt-oss-20b",
    temperature: 0.1,
    batchSize: 15,
    maxRetries: 2,
    // Estimated pricing per 1M tokens in USD (used for cost calculation reports)
    pricing: {
      inputPerMillion: 0.15, // Groq gpt-oss-20b / fast open-source tier
      outputPerMillion: 0.60,
    },
  },
  dedupe: {
    fuzzyTitleSimilarityThreshold: 0.85,
  },
  pipeline: {
    requestDelayMs: 300, // Polite delay between requests to the same source
    requestTimeoutMs: 12000,
    userAgent: "BeepFresherJobPipeline/1.0 (+https://beep.careers; contact@beep.careers)",
  },
} as const;
