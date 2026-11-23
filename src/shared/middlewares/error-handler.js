import { AppError } from "../errors/app-error.js";

export function errorHandler(error, _req, res, _next) {
  if (error instanceof AppError) {
    return res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    });
  }
  if (error.code === "23505") {
    return res.status(409).json({
      error: {
        code: "ACCOUNT_CONFLICT",
        message: "E-mail ou nome de usuário já cadastrado.",
      },
    });
  }
  if (error.code === "23503") {
    return res.status(409).json({
      error: {
        code: "REFERENCE_CONFLICT",
        message: "Remova os vínculos deste registro antes de excluí-lo.",
      },
    });
  }
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({
      error: { code: "INVALID_JSON", message: "Envie um JSON válido." },
    });
  }
  if (error.type === "entity.too.large") {
    return res.status(413).json({
      error: { code: "PAYLOAD_TOO_LARGE", message: "Conteúdo muito grande." },
    });
  }
  console.error("Falha interna na API.", error.code ?? error.name ?? "Error");
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Não foi possível concluir a operação.",
    },
  });
}
