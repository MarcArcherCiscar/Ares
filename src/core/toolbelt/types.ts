// src/core/toolbelt/types.ts
export interface ToolbeltContext {
  /** Directorio donde las tools pueden dejar artefactos (p. ej. screenshots) para que el canal los recoja. */
  outputDir: string;
  /** Directorio de memoria (inyectable para tests; por defecto ~/.ares/memory). */
  memoryDir?: string;
}
