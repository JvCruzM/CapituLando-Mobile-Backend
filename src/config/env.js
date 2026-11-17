import { z } from "zod";

const schema = z.object({
  HOST: z.string().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.url({ protocol: /^postgres(?:ql)?$/ }),
  CORS_ORIGINS: z
    .string()
    .default("")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
});

export function readEnvironment(input) {
  const result = schema.safeParse(input);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join("."));
    throw new Error(`Confira as variáveis de ambiente: ${fields.join(", ")}`);
  }
  return result.data;
}
