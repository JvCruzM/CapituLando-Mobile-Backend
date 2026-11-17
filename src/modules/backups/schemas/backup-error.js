export class BackupError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function invalidBackup(message = "O arquivo contém dados inválidos.") {
  return new BackupError(400, "INVALID_BACKUP", message);
}
